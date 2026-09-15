import type { DetectedItem } from "../types.js";
import { GENERATOR_SIGNATURES, COMMENT_SIGNATURES } from "../knowledge.js";

/**
 * Detect plugins that declare themselves in a <meta name="generator"> tag.
 * Many builders/SEO plugins do, often with an exact version — a passive,
 * high-signal source that needs no extra requests.
 */
export function detectFromGenerators(generators: string[]): DetectedItem[] {
  const found: DetectedItem[] = [];
  for (const gen of generators) {
    for (const sig of GENERATOR_SIGNATURES) {
      const m = gen.match(sig.re);
      if (!m) continue;
      found.push({
        slug: sig.slug,
        name: sig.name,
        version: m[1],
        confidence: "high",
        evidence: [{ method: "generator-meta", detail: gen.slice(0, 80) }],
      });
      break; // one plugin per generator string
    }
  }
  return found;
}

/**
 * Detect plugins from their distinctive HTML comments (Yoast, WP Rocket, W3TC,
 * caching plugins…). Yoast and a few others include their version in the note.
 */
export function detectFromComments(html: string): DetectedItem[] {
  const found: DetectedItem[] = [];
  for (const sig of COMMENT_SIGNATURES) {
    const m = html.match(sig.re);
    if (!m) continue;
    const version = m[1];
    found.push({
      slug: sig.slug,
      name: sig.name,
      version,
      confidence: "high",
      evidence: [{ method: "html-comment", detail: m[0].slice(0, 80) }],
    });
  }
  return found;
}
