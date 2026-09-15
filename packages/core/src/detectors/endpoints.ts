import type { EndpointInfo, Fetcher } from "../types.js";
import { originUrl } from "../utils.js";

/**
 * Probe well-known WordPress endpoints. `restApi` is supplied by the caller
 * (already known from the REST probe); the rest are checked here.
 * Only the cheap check runs in passive mode.
 */
export async function probeEndpoints(
  base: string,
  fetcher: Fetcher,
  restApi: boolean,
  active: boolean,
): Promise<EndpointInfo> {
  const info: EndpointInfo = { restApi };

  // xmlrpc.php responds 405 to GET when present (it wants POST).
  const xmlrpc = await fetcher(originUrl(base, "/xmlrpc.php"), { soft: true, method: "GET" });
  info.xmlrpc = xmlrpc.status === 405 || /XML-RPC server accepts POST/i.test(xmlrpc.body);

  if (!active) return info;

  const [sitemap, login, debug, uploads, plugins] = await Promise.all([
    fetcher(originUrl(base, "/wp-sitemap.xml"), { soft: true }),
    fetcher(originUrl(base, "/wp-login.php"), { soft: true }),
    fetcher(originUrl(base, "/wp-content/debug.log"), { soft: true }),
    fetcher(originUrl(base, "/wp-content/uploads/"), { soft: true }),
    fetcher(originUrl(base, "/wp-content/plugins/"), { soft: true }),
  ]);

  info.sitemap = sitemap.ok && /<sitemap|<urlset/i.test(sitemap.body);
  info.loginPage = login.ok && /user_login|loginform|wp-submit/i.test(login.body);
  // A world-readable debug.log is a genuine information-disclosure finding.
  info.debugLog =
    debug.ok && /PHP (Notice|Warning|Fatal|Deprecated)|WordPress database error/i.test(debug.body);
  // Autoindex/directory-listing enabled — leaks the file tree.
  const isListing = (r: typeof uploads) =>
    r.ok && /<title>\s*Index of \/|<h1>\s*Index of \/|Directory listing for/i.test(r.body);
  info.directoryListing = isListing(uploads) || isListing(plugins);

  return info;
}
