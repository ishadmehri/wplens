import type { Fetcher, Guess } from "../types.js";
import { originUrl } from "../utils.js";
import type { HtmlFacts } from "./html.js";

const VER_RE = /([0-9]+\.[0-9]+(?:\.[0-9]+)?)/;

/**
 * Determine the WordPress core version from the cheapest signals first.
 * Passive: meta generator, wp-includes asset ?ver=.
 * Active: RSS feed <generator>, readme.html.
 */
export async function detectCoreVersion(
  base: string,
  facts: HtmlFacts,
  fetcher: Fetcher,
  active: boolean,
): Promise<Guess<string> | undefined> {
  // 1. meta generator (highest passive signal when present and not stripped)
  if (facts.metaGenerator && /wordpress/i.test(facts.metaGenerator)) {
    const v = facts.metaGenerator.match(/wordpress\s+([0-9][0-9a-z.\-]*)/i);
    if (v) {
      return {
        value: v[1],
        confidence: "high",
        evidence: [{ method: "meta-generator", detail: facts.metaGenerator }],
      };
    }
  }

  // Keep the weaker asset-based guess as a fallback if nothing better shows up.
  let fallback: Guess<string> | undefined;
  if (facts.coreAssetVersion && VER_RE.test(facts.coreAssetVersion)) {
    fallback = {
      value: facts.coreAssetVersion,
      confidence: "medium",
      evidence: [
        { method: "asset-ver", detail: `wp-includes ?ver=${facts.coreAssetVersion}` },
      ],
    };
  }

  if (active) {
    // 2. RSS feed generator tag
    const feed = await fetcher(originUrl(base, "/feed/"), { soft: true });
    if (feed.ok) {
      const g = feed.body.match(/<generator>[^<]*wordpress\.org\/\?v=([0-9][0-9a-z.\-]*)/i);
      if (g) {
        return {
          value: g[1],
          confidence: "high",
          evidence: [{ method: "feed-generator", url: feed.url, detail: g[0].slice(0, 80) }],
        };
      }
    }
    // 3. readme.html (often present, shows "Version X.Y")
    const readme = await fetcher(originUrl(base, "/readme.html"), { soft: true });
    if (readme.ok && /wordpress/i.test(readme.body)) {
      const r = readme.body.match(/Version\s+([0-9.]+)/i);
      if (r) {
        return {
          value: r[1],
          confidence: "high",
          evidence: [{ method: "readme.html", url: readme.url, detail: `Version ${r[1]}` }],
        };
      }
    }
  }

  return fallback;
}
