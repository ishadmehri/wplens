import type { Fetcher, FetchOptions, HttpResponse } from "./types.js";

const DEFAULT_UA =
  "wplens/0.1 (+https://github.com/ishadmehri/wplens) WordPress stack profiler";

/**
 * A Fetcher built on the platform `fetch` (Node 20+ and all modern browsers).
 * Used by the CLI directly; the browser extension can supply its own if it
 * needs to route requests through a background service worker for CORS.
 */
export function createFetchFetcher(opts: {
  userAgent?: string;
  defaultTimeoutMs?: number;
} = {}): Fetcher {
  const ua = opts.userAgent ?? DEFAULT_UA;
  const defTimeout = opts.defaultTimeoutMs ?? 10000;

  return async (url: string, o: FetchOptions = {}): Promise<HttpResponse> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), o.timeoutMs ?? defTimeout);
    try {
      const res = await fetch(url, {
        method: o.method ?? "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": ua, accept: "*/*" },
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
      // Cap body size to keep memory sane on large pages.
      const raw = o.method === "HEAD" ? "" : await res.text();
      const body = raw.length > 2_000_000 ? raw.slice(0, 2_000_000) : raw;
      return { url: res.url || url, status: res.status, headers, body, ok: res.ok };
    } catch (err) {
      if (o.soft) {
        return { url, status: 0, headers: {}, body: "", ok: false };
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  };
}
