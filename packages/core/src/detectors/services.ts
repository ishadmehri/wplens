import type { DetectedService } from "../types.js";
import { SERVICE_SIGNATURES } from "../knowledge.js";

/**
 * Detect third-party services (tag managers, analytics, ad pixels, chat…) from
 * the homepage HTML — both external <script src> hosts and inline snippets.
 * Passive: everything comes from the page we already fetched.
 */
export function detectServices(html: string): DetectedService[] {
  const found: DetectedService[] = [];
  for (const sig of SERVICE_SIGNATURES) {
    if (!sig.re.test(html)) continue;
    let id: string | undefined;
    if (sig.idRe) {
      const m = html.match(sig.idRe);
      if (m) id = m[1] ?? m[0];
    }
    found.push({
      name: sig.name,
      category: sig.category,
      id,
      evidence: [{ method: "script-signature", detail: id ?? sig.name }],
    });
  }
  return found;
}
