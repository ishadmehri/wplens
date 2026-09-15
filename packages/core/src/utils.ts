import type { Confidence } from "./types.js";

/** Normalise a user-supplied target into an absolute http(s) URL. */
export function normalizeTarget(input: string): string {
  let t = input.trim();
  if (!/^https?:\/\//i.test(t)) t = "https://" + t;
  const u = new URL(t);
  return u.toString();
}

/** Join a path onto an origin, ignoring the target's own path. */
export function originUrl(base: string, path: string): string {
  const u = new URL(base);
  return new URL(path, `${u.protocol}//${u.host}`).toString();
}

/** Rank of confidence for comparisons (higher = more certain). */
const RANK: Record<Confidence, number> = {
  confirmed: 3,
  high: 2,
  medium: 1,
  low: 0,
};

export function maxConfidence(a: Confidence, b: Confidence): Confidence {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Extract the `ver` query parameter from an asset URL, if it looks like a version. */
export function versionFromAssetUrl(url: string): string | undefined {
  const m = url.match(/[?&]ver=([^&#'"]+)/i);
  if (!m) return undefined;
  const v = decodeURIComponent(m[1]);
  // Ignore cache-busting hashes / timestamps; keep dotted versions.
  if (/^\d+(\.\d+){1,3}([a-z0-9.\-]*)?$/i.test(v)) return v;
  return undefined;
}

/** A very small concurrency-limited map. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx]);
      }
    });
  await Promise.all(workers);
  return results;
}

/** Decode common HTML entities found in extracted attributes. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?38;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

/** Turn a plugin/theme slug into a human-ish name as a fallback. */
export function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
