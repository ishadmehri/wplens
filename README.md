# wplens

**Fast WordPress stack profiler for freelancers and agencies.**

Point it at a site and it tells you, in a second or two, what that site is built
with: WordPress core version, active theme, plugins (with versions where it can
find them), hosting / CDN / WAF, exposed endpoints, and more.

It is built for a specific everyday job: a client asks you to look at their site
and quote for support. You want a quick, honest inventory of the stack — not a
noisy pentest. `wplens` gives you that from the command line, and shares one
detection engine that will also power the upcoming browser extensions.

> ℹ️ This is a **profiler**, not an exploit tool. It reads public signals.
> Only scan sites you own or are authorised to assess.

## Install

```bash
# from the repo (workspaces)
npm install
npm run build

# then run it once, without installing globally
node packages/cli/dist/index.js example.com
```

### Make `wplens` available everywhere (from the repo)

```bash
npm run build                 # ensure dist/ is up to date
cd packages/cli && npm link   # symlinks `wplens` + `wpl` into your global bin
```

Now `wplens` (and the short alias `wpl`) work from any directory and in any
shell (bash, PowerShell, cmd). To remove it later: `npm unlink -g wplens`.
After changing source, re-run `npm run build` — the linked command picks it up
automatically (it points at `dist/`).

Once published to npm this becomes:

```bash
npm i -g wplens
wplens example.com      # or the short alias: wpl example.com
```

## Usage

```bash
wplens <url> [options]
```

You can pass **one or more** targets, or read a list from a file / stdin.

| Option              | Description                                                        |
| ------------------- | ----------------------------------------------------------------- |
| `-i, --input <file>`| Read targets from a file (one per line, `#` = comment). `-` = stdin |
| `-a, --active`      | Active mode: read `readme.txt`/`style.css` for exact versions, probe sitemap, login page and `debug.log` |
| `--users`           | Attempt user enumeration via the REST API (authorised sites only) |
| `--json`            | Emit raw JSON (an array when multiple targets)                    |
| `-o, --html <file>` | Also write a standalone HTML report to `<file>`                  |
| `-t, --timeout <ms>`| Per-request timeout (default 10000)                              |
| `--no-color`        | Disable colored output                                            |
| `-h, --help`        | Help                                                              |

Exit code: `0` when at least one target was reachable (single target: `0` if it
is WordPress, `1` if not), `1` when everything was unreachable, `2` on a usage error.

### Examples

```bash
wplens example.com                              # quick passive profile
wplens example.com --active                     # exact plugin & theme versions
wplens a.com b.com c.com --active               # scan several, get a summary
wplens example.com --active --html report.html  # client-facing HTML report
wplens -i sites.txt --active --json > out.json  # batch from a file
cat sites.txt | wplens -i - --active            # batch from stdin
```

## How detection works

Two modes, so you choose the trade-off between depth and noise:

- **Passive (default)** — a handful of requests. The homepage alone is
  information-dense:
  - asset URLs reveal plugin/theme slugs and often their exact version via the
    `?ver=` query string;
  - **every `<meta name="generator">`** — not just WordPress core, but the ones
    plugins add for themselves (Elementor, WooCommerce, AIOSEO…), frequently
    **with an exact version**;
  - **distinctive HTML comments** (Yoast — with its version — plus WP Rocket,
    W3 Total Cache, LiteSpeed and other caching plugins);
  - `/wp-json/` REST namespaces that map to popular plugins **without
    brute-forcing any paths**;
  - response headers → server, PHP, CDN/WAF **and the managed host** (Kinsta,
    WP Engine, WordPress VIP, Pantheon…), which matters a lot when quoting support;
  - **third-party services** from `<script>` tags and inline snippets — Google
    Tag Manager, GA4/Universal Analytics, Meta/TikTok/LinkedIn pixels, Hotjar,
    Clarity, chat widgets, payment SDKs — with their container/measurement IDs
    where present.
- **Active (`--active`)** — a few more targeted requests: each plugin's
  `readme.txt` (`Stable tag:` → exact version), the theme's `style.css` header
  (name, version, author, parent theme) and its `screenshot.png`, the RSS feed
  and `readme.html` for the core version, plus `wp-sitemap.xml`, `wp-login.php`,
  a readable `wp-content/debug.log`, and whether **directory browsing**
  (autoindex) is enabled on `wp-content` — both information-disclosure flags.

Every finding carries a **confidence** level (`confirmed` / `high` / `medium` /
`low`) and the evidence behind it, because public fingerprints are sometimes
stripped or spoofed.

## Architecture

A monorepo with one shared, environment-agnostic detection core:

```
packages/
  core/       @wplens/core  — the detection engine. No Node/DOM imports; all
                             network I/O goes through an injected `Fetcher`, so
                             the same code runs in Node and in a browser.
  cli/        wplens        — the command-line tool.
  extension/  @wplens/extension — Chrome + Firefox popup (MV3), same core.
```

That shared core is the point: the CLI and the browser extension run the
**exact same detection logic**, so a new signature added once shows up
everywhere.

## Browser extension

One-click profiling of the site in the active tab. The popup runs the shared
core directly (no background service worker), which keeps a single MV3 build
working in both Chrome and Firefox.

```bash
npm run build --workspace packages/core       # core must be built first
npm run build --workspace packages/extension   # bundles -> packages/extension/dist
```

Then load it unpacked:

- **Chrome / Edge** — go to `chrome://extensions`, enable *Developer mode*,
  click *Load unpacked*, and pick `packages/extension/dist`.
- **Firefox** — go to `about:debugging#/runtime/this-firefox`, click *Load
  Temporary Add-on*, and pick `packages/extension/dist/manifest.json`.

Open any WordPress site and click the wplens toolbar icon. Tick **Deep scan**
for exact plugin/theme versions (active mode). It needs broad host access
(`*://*/*`) so it can query the site you are viewing.

The first open of a tab scans it once and caches the result (in
`storage.session`, cleared when the browser closes). Re-opening the popup shows
that cached result instantly instead of re-scanning — click **Rescan** to
refresh.

## wplens vs WPScan

Both look at WordPress sites, but they answer different questions. **WPScan** is
a security scanner: "does this site have known vulnerabilities?" **wplens** is a
stack profiler: "what is this site built with?" — a fast, quiet inventory you can
run before quoting support or maintenance. They complement each other.

| | **wplens** | **WPScan** |
|---|---|---|
| Purpose | Stack profiling / inventory | Security & vulnerability scanning |
| CVE / vuln database | ✗ (on the roadmap) | ✓ WPVulnDB — its core strength |
| Plugin discovery | Passive: homepage + REST + generator/comments | Aggressive: brute-forces thousands of wordlist paths |
| Speed / footprint | Fast, polite, looks like a normal visit | Slow, noisy, trips WAFs |
| Third-party services (GTM, GA, pixels) | ✓ with IDs | ✗ |
| Managed-host detection (Kinsta, WP Engine…) | ✓ | ✗ |
| Browser extension | ✓ Chrome + Firefox, one click | ✗ CLI + API only |
| Password brute-force | ✗ (by design) | ✓ |
| User enumeration | Optional, no brute-force | ✓ |
| Install | `npm` / load-unpacked | Ruby gem |
| Cost | Fully free / MIT | CLI free; API 25 req/day on the free tier |

Use **WPScan** for a security assessment; use **wplens** for a quick, broad
picture of the stack across the CLI and the browser.

## Roadmap

- [x] Browser extension (Chrome + Firefox, MV3) on top of `@wplens/core`
- [x] Generator-meta, HTML-comment, and managed-host detection
- [x] Standalone HTML report (`--html`) for handing to clients
- [ ] Toolbar icons + published store listings
- [ ] Keep growing the REST-namespace / signature / host knowledge maps
- [ ] Optional CVE lookup against a public vulnerability feed

## License

MIT
