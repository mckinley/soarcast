// canonical-url: one page, one address (the pjmgmt canonical-urls standard).
//
// canonicalRedirect(request) answers a GET or HEAD for a page whose path has
// capitals or a trailing slash with a 301 to its lowercase, slash-free form,
// keeping the query string. React Router matches paths case-insensitively and
// accepts a trailing slash, so without this every page answers at several
// addresses. Call it first in the Worker's fetch:
//
//   const redirect = canonicalRedirect(request, { keepCase: [/^\/live\//] })
//   if (redirect) return redirect
//
// It leaves alone other methods, /api/* (or whatever `skip` lists), files
// (a last segment with a dot, such as /assets/index-AbC.js or /about.data),
// and the case of paths matching `keepCase`: tokens, invite codes and
// uploaded files, whose case is meaningful. Percent-escapes keep their case.
//
// canonicalHref(origin, pathname) is the href for <link rel="canonical">.
//
// From mckinley/pjmgmt scripts/automations/templates/canonical-url.ts.
// Change it there, then copy it into each app.

export interface CanonicalOptions {
  /** Paths whose case is meaningful, tested against the lowercased path */
  keepCase?: RegExp[];
  /** Paths left exactly as they are; /api/ by default */
  skip?: RegExp[];
}

const DEFAULT_SKIP = [/^\/api\//];

/** The canonical form of a path: no trailing slash and, unless keepCase matches, lowercase. */
export function canonicalPath(pathname: string, options: CanonicalOptions = {}): string {
  const { keepCase = [], skip = DEFAULT_SKIP } = options;
  if (skip.some((re) => re.test(pathname))) return pathname;
  const path = pathname.replace(/\/+$/, '') || '/';
  const lower = path.toLowerCase();
  const last = path.slice(path.lastIndexOf('/') + 1);
  if (last.includes('.') || keepCase.some((re) => re.test(lower))) return path;
  return path.replace(/%[0-9A-Fa-f]{2}|[A-Z]+/g, (m) => (m[0] === '%' ? m : m.toLowerCase()));
}

/** A 301 to the canonical URL, or null when the request is already there. */
export function canonicalRedirect(request: Request, options?: CanonicalOptions): Response | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  const path = canonicalPath(url.pathname, options);
  if (path === url.pathname) return null;
  url.pathname = path;
  return new Response(null, {
    status: 301,
    headers: { Location: url.toString(), 'Cache-Control': 'public, max-age=3600' },
  });
}

/** The absolute canonical URL of a page: origin plus canonical path, no query string. */
export function canonicalHref(
  origin: string,
  pathname: string,
  options?: CanonicalOptions,
): string {
  return origin.replace(/\/+$/, '') + canonicalPath(pathname, options);
}
