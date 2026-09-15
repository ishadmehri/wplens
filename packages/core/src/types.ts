/**
 * Shared types for the wplens detection engine.
 *
 * The engine is deliberately environment-agnostic: it never imports Node or
 * browser APIs directly. All network access goes through an injected `Fetcher`
 * so the exact same code runs in the CLI (Node global fetch) and in the browser
 * extensions (window.fetch / background fetch).
 */

/** Rough confidence level attached to every finding. */
export type Confidence = "confirmed" | "high" | "medium" | "low";

/** A single piece of evidence that led to a finding. */
export interface Evidence {
  /** Short machine id of the detection method, e.g. "meta-generator". */
  method: string;
  /** Human-readable detail, e.g. the raw matched string. */
  detail?: string;
  /** The URL the evidence came from, when relevant. */
  url?: string;
}

/** A detected plugin or theme. */
export interface DetectedItem {
  slug: string;
  name?: string;
  version?: string;
  confidence: Confidence;
  evidence: Evidence[];
  /** For themes: URL of the theme screenshot.png, if it exists. */
  screenshot?: string;
}

/** A third-party service (analytics, tag manager, pixel…) seen on the page. */
export interface DetectedService {
  name: string;
  /** Category, e.g. "Analytics", "Tag manager", "Ads", "Chat". */
  category: string;
  /** Account/container/pixel id where we could extract one. */
  id?: string;
  evidence: Evidence[];
}

/** A value plus how sure we are and why. */
export interface Guess<T> {
  value: T;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface DetectedUser {
  /** login/slug as exposed by WordPress. */
  slug: string;
  name?: string;
  id?: number;
  evidence: Evidence[];
}

export interface InfraInfo {
  server?: string;
  poweredBy?: string;
  php?: string;
  /** CDN / WAF products inferred from headers, e.g. ["Cloudflare"]. */
  cdnWaf: string[];
  /** Managed WordPress hosts inferred from headers, e.g. ["Kinsta"]. */
  hosting: string[];
  https: boolean;
}

export interface EndpointInfo {
  restApi: boolean;
  xmlrpc?: boolean;
  sitemap?: boolean;
  feed?: boolean;
  loginPage?: boolean;
  /** Publicly readable debug.log — a real finding worth flagging. */
  debugLog?: boolean;
  /** Directory listing (autoindex) enabled on wp-content/uploads. */
  directoryListing?: boolean;
}

export interface ScanResult {
  target: string;
  finalUrl: string;
  /** HTTP status of the homepage request (0 = unreachable). */
  homeStatus: number;
  isWordPress: boolean;
  wpVersion?: Guess<string>;
  /** Active theme, if identified. */
  theme?: DetectedItem;
  /** All themes seen referenced (parent/child, others). */
  themes: DetectedItem[];
  plugins: DetectedItem[];
  users: DetectedUser[];
  /** Third-party services (analytics, tag managers, pixels, chat…). */
  services: DetectedService[];
  infra: InfraInfo;
  endpoints: EndpointInfo;
  /** Human-friendly notes, e.g. "Page builder: Elementor". */
  hints: string[];
  timing: { ms: number };
  errors: string[];
}

export type ScanMode = "passive" | "active";

export interface ScanOptions {
  /** "passive" = homepage + a couple of cheap endpoints. "active" = also probe
   *  readme files, plugin versions, xmlrpc, sitemap, debug.log. */
  mode?: ScanMode;
  /** Attempt user enumeration (REST API + author archive). Off by default. */
  enumerateUsers?: boolean;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Max concurrent requests during active probing. */
  concurrency?: number;
  /** Optional callback for progress/verbose logging. */
  onProgress?: (message: string) => void;
}

/** Minimal HTTP response shape the engine understands. */
export interface HttpResponse {
  /** Final URL after redirects. */
  url: string;
  status: number;
  /** Lower-cased header names -> value. */
  headers: Record<string, string>;
  body: string;
  ok: boolean;
}

export interface FetchOptions {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  /** If true, resolve even on network error with a synthetic status 0. */
  soft?: boolean;
}

/** Injected network function. Must not throw for `soft` requests. */
export type Fetcher = (
  url: string,
  opts?: FetchOptions,
) => Promise<HttpResponse>;
