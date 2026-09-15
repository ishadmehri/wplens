import type {
  DetectedItem,
  Fetcher,
  ScanOptions,
  ScanResult,
} from "./types.js";
import { normalizeTarget, humanizeSlug, maxConfidence } from "./utils.js";
import { parseHtml, activeThemeFromBody } from "./detectors/html.js";
import { detectCoreVersion } from "./detectors/core-version.js";
import { probeRestApi, enumerateUsers } from "./detectors/restapi.js";
import { detectFromGenerators, detectFromComments } from "./detectors/signatures.js";
import { detectInfra } from "./detectors/infra.js";
import { probeEndpoints } from "./detectors/endpoints.js";
import { enrichPluginVersions, readThemeHeader, findThemeScreenshot } from "./detectors/enrich.js";
import { detectServices } from "./detectors/services.js";
import { HTML_SIGNATURES, PLUGIN_NAMES, THEME_NAMES } from "./knowledge.js";

/**
 * Run a full scan against a target URL using the provided fetcher.
 * The fetcher is the only I/O dependency, which keeps this function usable in
 * Node (CLI) and in the browser (extensions) without changes.
 */
export async function scan(
  target: string,
  fetcher: Fetcher,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const started = Date.now();
  const active = options.mode === "active";
  const concurrency = options.concurrency ?? 6;
  const log = options.onProgress ?? (() => {});
  const errors: string[] = [];

  const base = normalizeTarget(target);
  const result: ScanResult = {
    target,
    finalUrl: base,
    homeStatus: 0,
    isWordPress: false,
    themes: [],
    plugins: [],
    users: [],
    services: [],
    infra: { https: base.startsWith("https:"), cdnWaf: [], hosting: [] },
    endpoints: { restApi: false },
    hints: [],
    timing: { ms: 0 },
    errors,
  };

  // 1. Fetch the homepage (the single most information-dense request).
  log("Fetching homepage...");
  const home = await fetcher(base, { soft: true, timeoutMs: options.timeoutMs });
  result.homeStatus = home.status;
  if (home.status === 0) {
    errors.push(`Could not reach ${base} (network error or timeout)`);
    result.timing.ms = Date.now() - started;
    return result;
  }
  result.finalUrl = home.url;
  result.infra = detectInfra(home);
  // A 4xx/5xx homepage is not "not WordPress" — say so instead of guessing.
  if (home.status >= 400) {
    errors.push(`Homepage returned HTTP ${home.status}; detection may be incomplete`);
  }

  const facts = parseHtml(home.body);

  // Third-party services from scripts/inline snippets (GTM, GA, pixels, chat…).
  result.services = detectServices(home.body);

  // WordPress signal: any wp-content / wp-includes / wp-json reference.
  result.isWordPress =
    /wp-content|wp-includes|\/wp-json/i.test(home.body) ||
    (facts.metaGenerator ?? "").toLowerCase().includes("wordpress");

  // 2. Core version.
  log("Detecting core version...");
  result.wpVersion = await detectCoreVersion(base, facts, fetcher, active);

  // 3. Plugins, gathered from several independent signals and merged.
  const rank: Record<string, number> = { confirmed: 3, high: 2, medium: 1, low: 0 };
  const pluginMap = new Map<string, DetectedItem>();
  const merge = (item: DetectedItem) => {
    const cur = pluginMap.get(item.slug);
    if (!cur) {
      pluginMap.set(item.slug, item);
      return;
    }
    // Prefer a curated name over a humanized-slug placeholder.
    if (item.name && cur.name === humanizeSlug(item.slug)) cur.name = item.name;
    else if (!cur.name) cur.name = item.name;
    // Take a version from an equal-or-stronger source, or any if we had none.
    if (item.version && (!cur.version || rank[item.confidence] >= rank[cur.confidence])) {
      cur.version = item.version;
    }
    cur.confidence = maxConfidence(cur.confidence, item.confidence);
    cur.evidence.push(...item.evidence);
  };

  // 3a. Asset paths (?ver=) from the homepage.
  for (const [slug, version] of facts.plugins) {
    merge({
      slug,
      name: humanizeSlug(slug),
      version,
      confidence: version ? "high" : "medium",
      evidence: [{ method: "asset-path", detail: `wp-content/plugins/${slug}` }],
    });
  }

  // 3b. REST API namespaces (no brute-force).
  log("Querying REST API...");
  const rest = await probeRestApi(base, fetcher);
  result.endpoints.restApi = rest.available;
  for (const p of rest.plugins) merge(p);

  // 3c. Generator <meta> tags (often carry an exact version, passively).
  for (const p of detectFromGenerators(facts.generators)) merge(p);

  // 3d. Distinctive HTML comments (Yoast version, caching plugins, etc.).
  for (const p of detectFromComments(home.body)) merge(p);

  // 3e. HTML body signatures (page builders, WooCommerce…) -> hints + plugins.
  for (const sig of HTML_SIGNATURES) {
    if (sig.re.test(home.body)) {
      if (!result.hints.includes(sig.hint)) result.hints.push(sig.hint);
      if (sig.slug) {
        merge({
          slug: sig.slug,
          name: sig.name ?? humanizeSlug(sig.slug),
          confidence: "medium",
          evidence: [{ method: "html-signature", detail: sig.hint }],
        });
      }
    }
  }

  result.plugins = [...pluginMap.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  // Relabel with curated names where we know a nicer one (zero-risk: slug-keyed).
  for (const p of result.plugins) {
    const nice = PLUGIN_NAMES[p.slug];
    if (nice) p.name = nice;
  }

  // Strengthen the WordPress verdict with everything we have gathered.
  result.isWordPress =
    result.isWordPress || rest.available || !!result.wpVersion || result.plugins.length > 0;

  // 5. Themes.
  const themeSlugs = [...facts.themes.keys()];
  const activeSlug = activeThemeFromBody(facts.bodyClasses) ?? themeSlugs[0];
  for (const slug of themeSlugs) {
    const item: DetectedItem = {
      slug,
      name: THEME_NAMES[slug] ?? humanizeSlug(slug),
      version: facts.themes.get(slug),
      confidence: facts.themes.get(slug) ? "high" : "medium",
      evidence: [{ method: "asset-path", detail: `wp-content/themes/${slug}` }],
    };
    result.themes.push(item);
    if (slug === activeSlug) result.theme = item;
  }

  // 6. Active enrichment: exact plugin versions + theme header.
  if (active) {
    log("Reading plugin readme.txt files...");
    await enrichPluginVersions(base, result.plugins, fetcher, concurrency);

    if (result.theme) {
      log("Reading theme style.css...");
      const head = await readThemeHeader(base, result.theme.slug, fetcher);
      if (head) {
        if (head.name) result.theme.name = head.name;
        if (head.version) {
          result.theme.version = head.version;
          result.theme.confidence = "confirmed";
        }
        result.theme.evidence.push({ method: "style.css", detail: head.name ?? result.theme.slug });
        if (head.template) result.hints.push(`Child theme of "${head.template}"`);
      }
      log("Checking theme screenshot...");
      result.theme.screenshot = await findThemeScreenshot(base, result.theme.slug, fetcher);
    }
  }

  // 7. Endpoints.
  log("Probing endpoints...");
  result.endpoints = await probeEndpoints(base, fetcher, rest.available, active);
  if (result.endpoints.debugLog) {
    result.hints.push("⚠ Public wp-content/debug.log is readable (info disclosure)");
  }
  if (result.endpoints.directoryListing) {
    result.hints.push("⚠ Directory browsing is enabled (wp-content is listable)");
  }

  // 8. Optional user enumeration.
  if (options.enumerateUsers) {
    log("Enumerating users...");
    result.users = await enumerateUsers(base, fetcher);
  }

  result.timing.ms = Date.now() - started;
  return result;
}
