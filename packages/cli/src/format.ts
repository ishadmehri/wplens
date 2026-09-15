import type { Confidence, ScanResult } from "@wplens/core";

// --- tiny zero-dependency ANSI helpers ---
let enabled = true;
export function setColor(on: boolean) {
  enabled = on;
}
const wrap = (code: string) => (s: string) =>
  enabled ? `\x1b[${code}m${s}\x1b[0m` : s;

const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  blue: wrap("34"),
  magenta: wrap("35"),
  cyan: wrap("36"),
  gray: wrap("90"),
};

// Evaluated at render time (not import time) so setColor() is respected.
function confBadge(level: Confidence): string {
  switch (level) {
    case "confirmed": return c.green("confirmed");
    case "high": return c.green("high");
    case "medium": return c.yellow("medium");
    case "low": return c.gray("low");
  }
}

function heading(title: string): string {
  return "\n" + c.bold(c.cyan(title));
}

function row(label: string, value: string): string {
  return `  ${c.dim(label.padEnd(14))} ${value}`;
}

/** Render a scan result as a human-friendly report. */
export function formatReport(r: ScanResult): string {
  const out: string[] = [];

  out.push(c.bold(`\nwplens  ${c.gray("->")}  ${r.finalUrl}`));

  if (!r.isWordPress) {
    out.push(
      c.yellow("\n  No clear WordPress signals found on this URL.") +
        c.dim("\n  (It may not be WordPress, or fingerprints are hidden.)"),
    );
    out.push(c.dim(`\n  Scanned in ${r.timing.ms} ms`));
    return out.join("\n");
  }

  out.push(heading("Core"));
  out.push(row("WordPress", c.green("yes")));
  if (r.wpVersion) {
    out.push(
      row("Version", `${c.bold(r.wpVersion.value)}  ${c.dim("(" )}${confBadge(r.wpVersion.confidence)}${c.dim(")")}`),
    );
  } else {
    out.push(row("Version", c.gray("unknown")));
  }

  if (r.theme) {
    out.push(heading("Theme"));
    const v = r.theme.version ? ` ${c.bold(r.theme.version)}` : "";
    out.push(row("Active", `${r.theme.name ?? r.theme.slug}${v}  ${c.dim("(")}${confBadge(r.theme.confidence)}${c.dim(")")}`));
    if (r.theme.slug !== (r.theme.name ?? "").toLowerCase()) {
      out.push(row("Slug", c.dim(r.theme.slug)));
    }
    if (r.theme.screenshot) out.push(row("Screenshot", c.blue(r.theme.screenshot)));
  }

  out.push(heading(`Plugins (${r.plugins.length})`));
  if (r.plugins.length === 0) {
    out.push(c.dim("  none detected from public signals"));
  } else {
    for (const p of r.plugins) {
      const v = p.version ? c.bold(p.version) : c.gray("?");
      out.push(
        `  ${c.green("•")} ${(p.name ?? p.slug).padEnd(26)} ${v.padEnd(12)} ${c.dim(confBadge(p.confidence))}`,
      );
    }
  }

  out.push(heading("Hosting & Infrastructure"));
  out.push(row("HTTPS", r.infra.https ? c.green("yes") : c.red("no")));
  if (r.infra.server) out.push(row("Server", r.infra.server));
  if (r.infra.php) out.push(row("PHP", r.infra.php));
  if (r.infra.poweredBy) out.push(row("Powered-By", r.infra.poweredBy));
  if (r.infra.hosting.length) out.push(row("Host", c.magenta(r.infra.hosting.join(", "))));
  if (r.infra.cdnWaf.length) out.push(row("CDN / WAF", c.magenta(r.infra.cdnWaf.join(", "))));

  out.push(heading("Endpoints"));
  const e = r.endpoints;
  out.push(row("REST API", e.restApi ? c.green("open") : c.gray("no/closed")));
  out.push(row("XML-RPC", e.xmlrpc ? c.yellow("enabled") : c.gray("disabled")));
  if (e.sitemap !== undefined) out.push(row("Sitemap", e.sitemap ? c.green("yes") : c.gray("no")));
  if (e.loginPage !== undefined) out.push(row("Login page", e.loginPage ? c.green("/wp-login.php") : c.gray("not found")));
  if (e.directoryListing !== undefined)
    out.push(row("Dir browsing", e.directoryListing ? c.red("ENABLED - listable") : c.green("disabled")));
  if (e.debugLog) out.push(row("debug.log", c.red("PUBLIC - info disclosure")));

  if (r.services.length) {
    out.push(heading(`Third-party services (${r.services.length})`));
    for (const s of r.services) {
      const id = s.id ? ` ${c.dim(s.id)}` : "";
      out.push(`  ${c.magenta("•")} ${(s.name).padEnd(24)} ${c.dim(s.category)}${id}`);
    }
  }

  if (r.users.length) {
    out.push(heading(`Users (${r.users.length})`));
    for (const u of r.users) {
      out.push(`  ${c.blue("•")} ${u.slug}${u.name && u.name !== u.slug ? c.dim(`  (${u.name})`) : ""}`);
    }
  }

  if (r.hints.length) {
    out.push(heading("Notes"));
    for (const h of r.hints) out.push(`  ${c.yellow("›")} ${h}`);
  }

  if (r.errors.length) {
    out.push(heading("Errors"));
    for (const err of r.errors) out.push(`  ${c.red("×")} ${err}`);
  }

  out.push(c.dim(`\nScanned in ${r.timing.ms} ms`));
  return out.join("\n");
}

// --- HTML report (client-facing deliverable) ---

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function yesNo(v: boolean | undefined): string {
  if (v === undefined) return '<span class="muted">n/a</span>';
  return v
    ? '<span class="ok">yes</span>'
    : '<span class="muted">no</span>';
}

function reportCard(r: ScanResult): string {
  const rows: string[] = [];
  const badge = r.isWordPress
    ? '<span class="pill ok">WordPress</span>'
    : '<span class="pill muted">Not detected</span>';

  const plugins = r.plugins.length
    ? r.plugins
        .map(
          (p) =>
            `<tr><td>${esc(p.name ?? p.slug)}</td><td class="mono">${esc(p.version ?? "—")}</td><td><span class="conf ${p.confidence}">${p.confidence}</span></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="3" class="muted">none detected from public signals</td></tr>';

  const users = r.users.length
    ? `<div class="block"><h3>Users (${r.users.length})</h3><ul>${r.users
        .map((u) => `<li class="mono">${esc(u.slug)}${u.name && u.name !== u.slug ? ` <span class="muted">(${esc(u.name)})</span>` : ""}</li>`)
        .join("")}</ul></div>`
    : "";

  const hints = r.hints.length
    ? `<div class="block"><h3>Notes</h3><ul>${r.hints.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div>`
    : "";

  rows.push(`
  <section class="card">
    <header class="card-head">
      <a href="${esc(r.finalUrl)}" target="_blank" rel="noopener">${esc(r.finalUrl)}</a>
      ${badge}
    </header>
    <div class="grid">
      <div class="block">
        <h3>Core</h3>
        <table class="kv">
          <tr><td>Version</td><td class="mono">${r.wpVersion ? `${esc(r.wpVersion.value)} <span class="conf ${r.wpVersion.confidence}">${r.wpVersion.confidence}</span>` : '<span class="muted">unknown</span>'}</td></tr>
          <tr><td>Theme</td><td>${r.theme ? `${esc(r.theme.name ?? r.theme.slug)} ${r.theme.version ? `<span class="mono">${esc(r.theme.version)}</span>` : ""}` : '<span class="muted">unknown</span>'}</td></tr>
        </table>
      </div>
      <div class="block">
        <h3>Hosting</h3>
        <table class="kv">
          <tr><td>HTTPS</td><td>${yesNo(r.infra.https)}</td></tr>
          ${r.infra.server ? `<tr><td>Server</td><td class="mono">${esc(r.infra.server)}</td></tr>` : ""}
          ${r.infra.php ? `<tr><td>PHP</td><td class="mono">${esc(r.infra.php)}</td></tr>` : ""}
          ${r.infra.hosting.length ? `<tr><td>Host</td><td>${esc(r.infra.hosting.join(", "))}</td></tr>` : ""}
          ${r.infra.cdnWaf.length ? `<tr><td>CDN / WAF</td><td>${esc(r.infra.cdnWaf.join(", "))}</td></tr>` : ""}
        </table>
      </div>
      <div class="block">
        <h3>Endpoints</h3>
        <table class="kv">
          <tr><td>REST API</td><td>${yesNo(r.endpoints.restApi)}</td></tr>
          <tr><td>XML-RPC</td><td>${yesNo(r.endpoints.xmlrpc)}</td></tr>
          <tr><td>Sitemap</td><td>${yesNo(r.endpoints.sitemap)}</td></tr>
          ${r.endpoints.directoryListing !== undefined ? `<tr><td>Dir browsing</td><td class="${r.endpoints.directoryListing ? "warn" : ""}">${r.endpoints.directoryListing ? "ENABLED" : "disabled"}</td></tr>` : ""}
          ${r.endpoints.debugLog ? `<tr><td>debug.log</td><td class="warn">PUBLIC</td></tr>` : ""}
        </table>
      </div>
    </div>
    ${r.theme?.screenshot ? `<div class="block"><h3>Theme screenshot</h3><img src="${esc(r.theme.screenshot)}" alt="theme screenshot" style="max-width:320px;border-radius:8px;border:1px solid #0002"></div>` : ""}
    ${r.services.length ? `<div class="block"><h3>Third-party services (${r.services.length})</h3><ul>${r.services.map((s) => `<li>${esc(s.name)} <span class="muted">${esc(s.category)}${s.id ? " · " + esc(s.id) : ""}</span></li>`).join("")}</ul></div>` : ""}
    <div class="block">
      <h3>Plugins (${r.plugins.length})</h3>
      <table class="plugins"><thead><tr><th>Name</th><th>Version</th><th>Confidence</th></tr></thead><tbody>${plugins}</tbody></table>
    </div>
    ${users}
    ${hints}
    ${r.errors.length ? `<div class="block"><h3>Errors</h3><ul>${r.errors.map((e) => `<li class="warn">${esc(e)}</li>`).join("")}</ul></div>` : ""}
  </section>`);

  return rows.join("");
}

/** Build a full standalone HTML report for one or more scans. */
export function formatHtml(results: ScanResult[]): string {
  const generated = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const cards = results.map(reportCard).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>wplens report</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --ink:#1a1d21; --muted:#6b7280; --line:#e5e7eb; --ok:#15803d; --warn:#b91c1c; --accent:#2563eb; }
  @media (prefers-color-scheme: dark){ :root{ --bg:#0f1216; --card:#171b20; --ink:#e6e8ea; --muted:#9aa2ac; --line:#2a2f36; --ok:#4ade80; --warn:#f87171; --accent:#60a5fa; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  .wrap { max-width:960px; margin:0 auto; padding:32px 20px 60px; }
  .top { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:20px; }
  .top h1 { font-size:20px; margin:0; letter-spacing:-.02em; }
  .top .sub { color:var(--muted); font-size:12px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin-bottom:18px; }
  .card-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding-bottom:12px; border-bottom:1px solid var(--line); margin-bottom:14px; flex-wrap:wrap; }
  .card-head a { color:var(--accent); text-decoration:none; font-weight:600; word-break:break-all; }
  .pill { font-size:11px; font-weight:600; padding:3px 9px; border-radius:999px; border:1px solid var(--line); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin-bottom:6px; }
  .block h3 { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:14px 0 8px; }
  table { width:100%; border-collapse:collapse; }
  .kv td { padding:3px 0; vertical-align:top; }
  .kv td:first-child { color:var(--muted); width:44%; }
  .plugins th, .plugins td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); }
  .plugins th { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
  .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .muted { color:var(--muted); }
  .ok { color:var(--ok); } .warn { color:var(--warn); font-weight:600; }
  .conf { font-size:10px; padding:1px 6px; border-radius:4px; border:1px solid var(--line); color:var(--muted); }
  .conf.confirmed,.conf.high { color:var(--ok); }
  ul { margin:4px 0; padding-left:18px; }
  footer { color:var(--muted); font-size:11px; text-align:center; margin-top:24px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <h1>wplens report</h1>
    <span class="sub">${esc(String(results.length))} site(s) · generated ${esc(generated)}</span>
  </div>
  ${cards}
  <footer>Generated by wplens — public-signal profiling only.</footer>
</div>
</body>
</html>`;
}
