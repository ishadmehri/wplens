import { scan, createFetchFetcher, type ScanResult } from "@wplens/core";

// Works in both Chrome (chrome.*) and Firefox (browser.*); both return promises
// for these APIs under MV3.
const ext: any = (globalThis as any).browser ?? (globalThis as any).chrome;

const fetcher = createFetchFetcher({ defaultTimeoutMs: 8000 });

// Cache results across popup opens so clicking the toolbar icon shows the last
// result instead of re-scanning every time. storage.session is per-browser-run
// and in-memory; fall back to local if session isn't available.
const store: any = ext?.storage?.session ?? ext?.storage?.local ?? null;
interface CacheEntry { result: ScanResult; mode: "passive" | "active"; ts: number; }

async function getCache(url: string): Promise<CacheEntry | null> {
  if (!store) return null;
  try {
    const key = "scan:" + url;
    const obj = await store.get(key);
    return obj?.[key] ?? null;
  } catch {
    return null;
  }
}

async function setCache(url: string, entry: CacheEntry): Promise<void> {
  if (!store) return;
  try {
    await store.set({ ["scan:" + url]: entry });
  } catch {
    /* storage quota / unavailable — non-fatal */
  }
}

const out = document.getElementById("out")!;
const urlEl = document.getElementById("url")!;
const deepEl = document.getElementById("deep") as HTMLInputElement;
const rescanEl = document.getElementById("rescan") as HTMLButtonElement;
const copyEl = document.getElementById("copy") as HTMLButtonElement;

let last: ScanResult | null = null;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

async function activeTabUrl(): Promise<string | undefined> {
  const tabs = await ext.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0]?.url;
}

function stateHtml(inner: string): string {
  return `<div class="state">${inner}</div>`;
}

function pill(ok: boolean, yes = "yes", no = "no"): string {
  return ok ? `<span class="pill ok">${yes}</span>` : `<span class="pill no">${no}</span>`;
}

function render(r: ScanResult): string {
  if (!r.isWordPress) {
    return stateHtml(
      r.homeStatus === 0
        ? `Could not reach this site.<br><span class="muted">${esc(r.errors[0] ?? "")}</span>`
        : `No clear WordPress signals here.<br><span class="muted">It may not be WordPress, or fingerprints are hidden.</span>`,
    );
  }

  const parts: string[] = [];

  // Core
  parts.push(`<div class="section"><h3>Core</h3><div class="card">
    <div class="kv"><span class="k">WordPress</span><span class="v">${pill(true)}</span></div>
    <div class="kv"><span class="k">Version</span><span class="v mono">${
      r.wpVersion ? `${esc(r.wpVersion.value)} <span class="conf ${r.wpVersion.confidence}">${r.wpVersion.confidence}</span>` : '<span class="muted">unknown</span>'
    }</span></div>
    ${r.theme ? `<div class="kv"><span class="k">Theme</span><span class="v">${esc(r.theme.name ?? r.theme.slug)}${r.theme.version ? ` <span class="mono">${esc(r.theme.version)}</span>` : ""}</span></div>` : ""}
    ${r.theme?.screenshot ? `<img class="shot" src="${esc(r.theme.screenshot)}" alt="theme screenshot" loading="lazy">` : ""}
  </div></div>`);

  // Plugins
  const plugins = r.plugins.length
    ? r.plugins
        .map(
          (p) => `<div class="plugin">
            <span class="name">${esc(p.name ?? p.slug)}</span>
            <span class="ver mono">${esc(p.version ?? "—")}</span>
            <span class="conf ${p.confidence}">${p.confidence}</span>
          </div>`,
        )
        .join("")
    : `<div class="muted">none detected from public signals</div>`;
  parts.push(`<div class="section"><h3>Plugins (${r.plugins.length})</h3><div class="card">${plugins}</div></div>`);

  // Hosting
  const infra: string[] = [];
  infra.push(`<div class="kv"><span class="k">HTTPS</span><span class="v">${pill(r.infra.https)}</span></div>`);
  if (r.infra.server) infra.push(`<div class="kv"><span class="k">Server</span><span class="v mono">${esc(r.infra.server)}</span></div>`);
  if (r.infra.php) infra.push(`<div class="kv"><span class="k">PHP</span><span class="v mono">${esc(r.infra.php)}</span></div>`);
  if (r.infra.hosting.length) infra.push(`<div class="kv"><span class="k">Host</span><span class="v">${esc(r.infra.hosting.join(", "))}</span></div>`);
  if (r.infra.cdnWaf.length) infra.push(`<div class="kv"><span class="k">CDN / WAF</span><span class="v">${esc(r.infra.cdnWaf.join(", "))}</span></div>`);
  parts.push(`<div class="section"><h3>Hosting</h3><div class="card">${infra.join("")}</div></div>`);

  // Endpoints
  const e = r.endpoints;
  parts.push(`<div class="section"><h3>Endpoints</h3><div class="card">
    <div class="kv"><span class="k">REST API</span><span class="v">${pill(e.restApi, "open", "closed")}</span></div>
    <div class="kv"><span class="k">XML-RPC</span><span class="v">${pill(!!e.xmlrpc, "enabled", "disabled")}</span></div>
    ${e.directoryListing !== undefined ? `<div class="kv"><span class="k">Dir browsing</span><span class="v ${e.directoryListing ? "warn" : ""}">${e.directoryListing ? "ENABLED" : "disabled"}</span></div>` : ""}
    ${e.debugLog ? `<div class="kv"><span class="k">debug.log</span><span class="v warn">PUBLIC</span></div>` : ""}
  </div></div>`);

  // Third-party services
  if (r.services.length) {
    const chips = r.services
      .map((s) => `<span class="chip" title="${esc(s.category)}">${esc(s.name)}${s.id ? ` <span class="muted">${esc(s.id)}</span>` : ""}</span>`)
      .join("");
    parts.push(`<div class="section"><h3>Third-party services (${r.services.length})</h3><div class="card"><div class="chips">${chips}</div></div></div>`);
  }

  // Notes
  if (r.hints.length) {
    parts.push(`<div class="section"><h3>Notes</h3><div class="card">${r.hints
      .map((h) => `<div class="hint">${esc(h)}</div>`)
      .join("")}</div></div>`);
  }

  parts.push(`<div class="section muted" style="text-align:center;font-size:11px">scanned in ${r.timing.ms} ms</div>`);
  return parts.join("");
}

/** Build a plain-text report for the clipboard. */
function textReport(r: ScanResult): string {
  const L: string[] = [];
  L.push(`wplens — ${r.finalUrl}`);
  L.push("");
  L.push(`WordPress: ${r.isWordPress ? "yes" : "no"}`);
  if (r.wpVersion) L.push(`Version:   ${r.wpVersion.value} (${r.wpVersion.confidence})`);
  if (r.theme) L.push(`Theme:     ${r.theme.name ?? r.theme.slug}${r.theme.version ? " " + r.theme.version : ""}`);
  L.push("");
  L.push(`Plugins (${r.plugins.length}):`);
  for (const p of r.plugins) L.push(`  - ${p.name ?? p.slug}${p.version ? " " + p.version : ""} [${p.confidence}]`);
  L.push("");
  L.push("Hosting:");
  L.push(`  HTTPS:     ${r.infra.https ? "yes" : "no"}`);
  if (r.infra.server) L.push(`  Server:    ${r.infra.server}`);
  if (r.infra.php) L.push(`  PHP:       ${r.infra.php}`);
  if (r.infra.hosting.length) L.push(`  Host:      ${r.infra.hosting.join(", ")}`);
  if (r.infra.cdnWaf.length) L.push(`  CDN/WAF:   ${r.infra.cdnWaf.join(", ")}`);
  L.push("");
  L.push("Endpoints:");
  L.push(`  REST API:  ${r.endpoints.restApi ? "open" : "closed"}`);
  L.push(`  XML-RPC:   ${r.endpoints.xmlrpc ? "enabled" : "disabled"}`);
  if (r.endpoints.directoryListing !== undefined) L.push(`  Dir browse:${r.endpoints.directoryListing ? " ENABLED" : " disabled"}`);
  if (r.endpoints.debugLog) L.push(`  debug.log: PUBLIC`);
  if (r.services.length) {
    L.push("");
    L.push("Third-party services:");
    for (const s of r.services) L.push(`  - ${s.name} (${s.category})${s.id ? " " + s.id : ""}`);
  }
  if (r.hints.length) {
    L.push("");
    L.push("Notes:");
    for (const h of r.hints) L.push(`  - ${h}`);
  }
  L.push("");
  L.push(`Generated by wplens · ${new Date().toISOString().slice(0, 10)}`);
  return L.join("\n");
}

/** Render a result (fresh or cached) and update the controls. */
function showResult(result: ScanResult, cached: boolean) {
  last = result;
  const banner = cached
    ? `<div class="cached">Showing last result · click Rescan to refresh</div>`
    : "";
  out.innerHTML = banner + render(result);
  copyEl.disabled = !result.isWordPress;
  rescanEl.textContent = "Rescan";
}

async function runScan() {
  rescanEl.disabled = true;
  copyEl.disabled = true;
  out.innerHTML = stateHtml(`<div class="spinner"></div>${deepEl.checked ? "Deep scan…" : "Scanning…"}`);

  const url = await activeTabUrl();
  urlEl.textContent = url ? url.replace(/^https?:\/\//, "") : "";

  if (!url || !/^https?:\/\//i.test(url)) {
    out.innerHTML = stateHtml("Open a website tab, then click Scan.<br><span class='muted'>Browser and extension pages can't be scanned.</span>");
    rescanEl.disabled = false;
    return;
  }

  try {
    const mode = deepEl.checked ? "active" : "passive";
    const result = await scan(url, fetcher, { mode });
    showResult(result, false);
    void setCache(url, { result, mode, ts: Date.now() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out.innerHTML = stateHtml(`<span class="warn">Scan failed</span><br><span class="muted">${esc(msg)}</span>`);
  } finally {
    rescanEl.disabled = false;
  }
}

async function copyReport() {
  if (!last) return;
  try {
    await navigator.clipboard.writeText(textReport(last));
    copyEl.textContent = "Copied!";
    copyEl.classList.add("done");
    setTimeout(() => {
      copyEl.textContent = "Copy";
      copyEl.classList.remove("done");
    }, 1400);
  } catch {
    copyEl.textContent = "Copy failed";
    setTimeout(() => (copyEl.textContent = "Copy"), 1400);
  }
}

rescanEl.addEventListener("click", runScan);
deepEl.addEventListener("change", runScan);
copyEl.addEventListener("click", copyReport);

/** On open: show the cached result for this tab if we have one; else scan once. */
async function init() {
  const url = await activeTabUrl();
  urlEl.textContent = url ? url.replace(/^https?:\/\//, "") : "";

  if (!url || !/^https?:\/\//i.test(url)) {
    out.innerHTML = stateHtml("Open a website tab, then click Scan.<br><span class='muted'>Browser and extension pages can't be scanned.</span>");
    return;
  }

  const cached = await getCache(url);
  if (cached) {
    deepEl.checked = cached.mode === "active";
    showResult(cached.result, true);
    return;
  }
  await runScan();
}

init();
