import { decodeEntities, versionFromAssetUrl } from "../utils.js";
import { SLUG_BLOCKLIST } from "../knowledge.js";

/** Structured facts extracted from a homepage HTML body (regex-based, no DOM). */
export interface HtmlFacts {
  /** slug -> best version seen in ?ver= on its assets. */
  plugins: Map<string, string | undefined>;
  /** slug -> best version seen (from theme asset ?ver=). */
  themes: Map<string, string | undefined>;
  /** The WordPress-core generator string, if any. */
  metaGenerator?: string;
  /** Every <meta name="generator"> content value on the page. */
  generators: string[];
  bodyClasses: string[];
  /** WP core version guessed from wp-includes asset ?ver=. */
  coreAssetVersion?: string;
  /** Raw list of asset URLs (js/css) for further inspection. */
  assets: string[];
}

const ATTR_URL_RE = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
const PLUGIN_RE = /wp-content\/(?:plugins|mu-plugins)\/([a-z0-9][a-z0-9._-]*)/i;
const THEME_RE = /wp-content\/themes\/([a-z0-9][a-z0-9._-]*)/i;
const META_GEN_RE =
  /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/gi;
const BODY_CLASS_RE = /<body[^>]*\sclass=["']([^"']+)["']/i;

export function parseHtml(html: string): HtmlFacts {
  const facts: HtmlFacts = {
    plugins: new Map(),
    themes: new Map(),
    generators: [],
    bodyClasses: [],
    assets: [],
  };

  // Collect every generator meta; keep the WordPress-core one separately.
  let gm: RegExpExecArray | null;
  META_GEN_RE.lastIndex = 0;
  while ((gm = META_GEN_RE.exec(html))) {
    const content = decodeEntities(gm[1]).trim();
    facts.generators.push(content);
    if (!facts.metaGenerator && /wordpress/i.test(content)) {
      facts.metaGenerator = content;
    }
  }

  const body = html.match(BODY_CLASS_RE);
  if (body) facts.bodyClasses = body[1].split(/\s+/).filter(Boolean);

  let m: RegExpExecArray | null;
  ATTR_URL_RE.lastIndex = 0;
  while ((m = ATTR_URL_RE.exec(html))) {
    const url = decodeEntities(m[1]);
    if (!/wp-content|wp-includes/i.test(url)) continue;
    facts.assets.push(url);
    const ver = versionFromAssetUrl(url);

    const pm = url.match(PLUGIN_RE);
    if (pm) {
      const slug = pm[1].toLowerCase();
      if (!SLUG_BLOCKLIST.has(slug) && (ver || !facts.plugins.has(slug)))
        facts.plugins.set(slug, ver ?? facts.plugins.get(slug));
    }
    const tm = url.match(THEME_RE);
    if (tm) {
      const slug = tm[1].toLowerCase();
      if (!SLUG_BLOCKLIST.has(slug) && (ver || !facts.themes.has(slug)))
        facts.themes.set(slug, ver ?? facts.themes.get(slug));
    }
    if (/wp-includes\//i.test(url) && ver && !facts.coreAssetVersion) {
      facts.coreAssetVersion = ver;
    }
  }

  return facts;
}

/** Detect the active theme from body classes (WordPress adds no theme class by
 *  default, but many themes/plugins do). Falls back handled by caller. */
export function activeThemeFromBody(bodyClasses: string[]): string | undefined {
  const hit = bodyClasses.find((c) => /^theme-/.test(c));
  return hit ? hit.replace(/^theme-/, "") : undefined;
}
