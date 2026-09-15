import type { DetectedItem, Fetcher } from "../types.js";
import { originUrl, mapLimit, maxConfidence } from "../utils.js";

/**
 * Active enrichment: fetch each plugin's readme.txt for its exact stable tag,
 * and parse a theme's style.css header. Only runs in active mode.
 */
export async function enrichPluginVersions(
  base: string,
  plugins: DetectedItem[],
  fetcher: Fetcher,
  concurrency: number,
): Promise<void> {
  await mapLimit(plugins, concurrency, async (p) => {
    if (p.version) return; // already known from ?ver=
    const res = await fetcher(
      originUrl(base, `/wp-content/plugins/${p.slug}/readme.txt`),
      { soft: true },
    );
    if (!res.ok) return;
    const tag = res.body.match(/Stable tag:\s*([0-9][0-9a-z.\-]*)/i);
    if (tag && !/trunk/i.test(tag[1])) {
      p.version = tag[1];
      p.confidence = maxConfidence(p.confidence, "high");
      p.evidence.push({ method: "readme.txt", detail: `Stable tag: ${tag[1]}`, url: res.url });
    }
    const name = res.body.match(/===\s*(.+?)\s*===/);
    if (name && !p.name) p.name = name[1].trim();
  });
}

export interface ThemeHeader {
  name?: string;
  version?: string;
  author?: string;
  template?: string; // parent theme, if this is a child theme
}

/** Parse the WordPress style.css header block for a theme. */
export async function readThemeHeader(
  base: string,
  slug: string,
  fetcher: Fetcher,
): Promise<ThemeHeader | undefined> {
  const res = await fetcher(
    originUrl(base, `/wp-content/themes/${slug}/style.css`),
    { soft: true },
  );
  if (!res.ok) return undefined;
  const head = res.body.slice(0, 2000);
  const field = (label: string) =>
    head.match(new RegExp(`${label}:\\s*(.+)`, "i"))?.[1]?.trim();
  return {
    name: field("Theme Name"),
    version: field("Version"),
    author: field("Author"),
    template: field("Template"),
  };
}

/**
 * Find a theme's screenshot (WordPress themes ship screenshot.png/.jpg).
 * Returns its URL if it exists, so a UI can preview it.
 */
export async function findThemeScreenshot(
  base: string,
  slug: string,
  fetcher: Fetcher,
): Promise<string | undefined> {
  for (const ext of ["png", "jpg", "jpeg", "gif", "webp"]) {
    const url = originUrl(base, `/wp-content/themes/${slug}/screenshot.${ext}`);
    const res = await fetcher(url, { soft: true, method: "HEAD" });
    if (res.ok && (res.headers["content-type"] ?? "").startsWith("image")) {
      return url;
    }
  }
  return undefined;
}
