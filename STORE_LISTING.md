# Store submission — wplens extension

Ready-to-paste listing copy and per-store notes for publishing the browser
extension to **Chrome Web Store**, **Microsoft Edge Add-ons**, and **Firefox
Add-ons (AMO)**. All three accept the same MV3 package.

## Package

Upload `release/wplens-<version>.zip` (built from `packages/extension/dist`,
`manifest.json` at the archive root, forward-slash paths).

Rebuild + repackage:

```bash
npm run build --workspace packages/extension
```

```powershell
# from repo root (Windows) — produces a store-valid zip with forward slashes
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$dist = "packages\extension\dist"; $out = "release\wplens-0.1.0.zip"
if (Test-Path $out) { Remove-Item $out -Force }
$fs = [IO.File]::Open((Resolve-Path .).Path + "\$out", 'Create')
$zip = New-Object IO.Compression.ZipArchive($fs, 'Create')
Get-ChildItem $dist -Recurse -File | % {
  $rel = $_.FullName.Substring((Resolve-Path $dist).Path.Length + 1).Replace('\','/')
  $e = $zip.CreateEntry($rel, 'Optimal'); $s = $e.Open()
  $b = [IO.File]::ReadAllBytes($_.FullName); $s.Write($b,0,$b.Length); $s.Close() }
$zip.Dispose(); $fs.Dispose()
```

On macOS/Linux: `cd packages/extension/dist && zip -r ../../../release/wplens-0.1.0.zip .`

---

## Listing copy (all stores)

**Name:** wplens — WordPress stack profiler

**Summary / short description (≤132 chars):**
See what any WordPress site is built with — core, theme, plugins, host and
third-party services — in one click.

**Category:** Developer Tools

**Detailed description:**

> wplens is a fast WordPress stack profiler for freelancers, agencies and
> developers. Open any WordPress site, click the toolbar icon, and get a clean
> inventory of what it runs — no setup, no account.
>
> What it detects:
> • WordPress core version
> • Active theme (name, version, screenshot) and parent theme
> • Installed plugins, with exact versions where available
> • Managed host (Kinsta, WP Engine, WordPress VIP, SiteGround…), CDN/WAF, PHP
> • Third-party services from the page — Google Tag Manager, GA4, Meta/TikTok/
>   LinkedIn pixels, Hotjar, Clarity, chat widgets, payment SDKs — with their IDs
> • Public endpoints: REST API, XML-RPC, sitemap, directory browsing, debug.log
>
> Two modes: a quick passive scan by default, and an optional Deep scan for exact
> plugin/theme versions and extra checks. Results are cached per tab, and one
> click copies a plain-text report.
>
> wplens is a profiler, not an exploit tool: it only reads public signals, runs
> no brute-force, and sends nothing anywhere. Open source (MIT):
> https://github.com/ishadmehri/wplens

---

## Permissions justification

Reviewers will ask why each permission is needed. Answers:

- **`activeTab`** — read the URL of the tab you explicitly click the icon on, so
  the scan targets the site you are viewing.
- **`tabs`** — get the active tab's URL to scan and to cache results per tab.
- **`storage`** — cache the last scan result per tab in `storage.session` so
  re-opening the popup is instant instead of re-scanning. In-memory, cleared when
  the browser closes.
- **`host_permissions: *://*/*`** — the extension can be used on any WordPress
  site, and must fetch that site's own public endpoints (`/wp-json/`,
  `readme.txt`, `style.css`, etc.) to profile it. Requests go only to the site
  being viewed; no third-party servers are contacted.

**Single purpose:** Identify the technology stack of the WordPress site in the
active tab.

## Privacy

- **No data collected, stored remotely, or transmitted to us or any third party.**
- All requests go from the user's browser to the site the user is viewing.
- The only stored state is an in-memory per-tab cache (`storage.session`) that
  clears on browser close.
- No analytics, no tracking, no accounts.

A privacy policy URL is only required if you collect data; since wplens collects
none, select "does not collect user data". If a store forces a URL, link to the
"Privacy" section of the repo README.

---

## Assets still needed (design, not code)

- **Screenshots** — at least one. Chrome/Edge: 1280×800 or 640×400. Firefox:
  any, 1280×800 recommended. Capture the popup on a real scan (a WooCommerce
  site shows the most sections).
- **Store icon** — 128×128 (`icons/icon128.png`, already in the package). Chrome
  also shows a 440×280 small promo tile (optional).

---

## Per-store notes

### Chrome Web Store
- Dashboard: https://chrome.google.com/webstore/devconsole (one-time $5 fee).
- Upload the zip, fill listing + privacy tab, justify `host_permissions` and
  `activeTab` under "Permissions justification". Broad host access gets extra
  review — the single-purpose statement above covers it.

### Microsoft Edge Add-ons
- Dashboard: https://partner.microsoft.com/dashboard/microsoftedge (free).
- Upload the **same zip**. Same listing copy. No separate manifest needed.

### Firefox Add-ons (AMO)
- Dashboard: https://addons.mozilla.org/developers/ (free).
- `manifest.json` already includes `browser_specific_settings.gecko`
  (id `wplens@wplens.dev`, `strict_min_version` 121.0).
- **Source code required:** `popup.js` is bundled by esbuild, so AMO's policy
  requires a source upload + build instructions. Provide:
  - Source: the `packages/` tree (or point to the public repo tag).
  - Build steps: `npm install` then
    `npm run build --workspace packages/core && npm run build --workspace packages/extension`;
    reviewers compare the resulting `packages/extension/dist` to the uploaded zip.
- Optionally sign/self-distribute via `web-ext sign` if not listing publicly.
