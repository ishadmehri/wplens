import type { HttpResponse, InfraInfo } from "../types.js";
import { HEADER_SIGNATURES, HOSTING_SIGNATURES } from "../knowledge.js";

/** Read server / CDN / WAF / host / PHP facts from the homepage response headers. */
export function detectInfra(home: HttpResponse): InfraInfo {
  const h = home.headers;
  const info: InfraInfo = {
    https: home.url.startsWith("https:"),
    cdnWaf: [],
    hosting: [],
  };

  if (h["server"]) info.server = h["server"];
  if (h["x-powered-by"]) {
    info.poweredBy = h["x-powered-by"];
    const php = h["x-powered-by"].match(/php\/([0-9.]+)/i);
    if (php) info.php = php[1];
  }

  for (const sig of HEADER_SIGNATURES) {
    try {
      if (sig.test(h)) info.cdnWaf.push(sig.product);
    } catch {
      /* ignore malformed header edge cases */
    }
  }
  for (const sig of HOSTING_SIGNATURES) {
    try {
      if (sig.test(h)) info.hosting.push(sig.product);
    } catch {
      /* ignore malformed header edge cases */
    }
  }
  info.cdnWaf = [...new Set(info.cdnWaf)];
  info.hosting = [...new Set(info.hosting)];

  return info;
}
