import type { DetectedItem, DetectedUser, Fetcher } from "../types.js";
import { originUrl } from "../utils.js";
import { REST_NAMESPACE_MAP } from "../knowledge.js";

export interface RestApiResult {
  available: boolean;
  /** Plugins inferred from exposed namespaces. */
  plugins: DetectedItem[];
  /** Raw namespaces, for hints. */
  namespaces: string[];
}

/**
 * The WordPress REST API index (/wp-json/) lists every registered namespace.
 * Many plugins register their own, so this reveals them with zero brute-force.
 */
export async function probeRestApi(base: string, fetcher: Fetcher): Promise<RestApiResult> {
  const res = await fetcher(originUrl(base, "/wp-json/"), { soft: true });
  if (!res.ok || !res.body) {
    // Some hosts only expose the ?rest_route= form.
    const alt = await fetcher(originUrl(base, "/?rest_route=/"), { soft: true });
    if (!alt.ok || !alt.body) return { available: false, plugins: [], namespaces: [] };
    return parseNamespaces(alt.body, alt.url);
  }
  return parseNamespaces(res.body, res.url);
}

function parseNamespaces(body: string, url: string): RestApiResult {
  let namespaces: string[] = [];
  try {
    const json = JSON.parse(body);
    if (Array.isArray(json?.namespaces)) namespaces = json.namespaces;
  } catch {
    // Fall back to a loose regex if the JSON is truncated/mangled.
    const m = body.match(/"namespaces":\s*\[([^\]]*)\]/);
    if (m) namespaces = m[1].split(",").map((s) => s.replace(/["\s]/g, "")).filter(Boolean);
  }

  const plugins: DetectedItem[] = [];
  for (const ns of namespaces) {
    const known = REST_NAMESPACE_MAP[ns];
    if (known) {
      plugins.push({
        slug: known.slug,
        name: known.name,
        confidence: "high",
        evidence: [{ method: "rest-namespace", detail: ns, url }],
      });
    }
  }
  return { available: namespaces.length > 0 || body.includes("routes"), plugins, namespaces };
}

/**
 * User enumeration via the REST API. Opt-in only. Intended for sites you are
 * authorised to assess (e.g. a client that handed you their site for support).
 */
export async function enumerateUsers(base: string, fetcher: Fetcher): Promise<DetectedUser[]> {
  const res = await fetcher(originUrl(base, "/wp-json/wp/v2/users"), { soft: true });
  if (!res.ok) return [];
  try {
    const arr = JSON.parse(res.body);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((u) => u && typeof u === "object")
      .map((u) => ({
        slug: String(u.slug ?? ""),
        name: typeof u.name === "string" ? u.name : undefined,
        id: typeof u.id === "number" ? u.id : undefined,
        evidence: [{ method: "rest-users", url: res.url }],
      }))
      .filter((u) => u.slug);
  } catch {
    return [];
  }
}
