// The staging password (docs/staging.md, pjmgmt's staging standard). On the
// staging copy every request needs the one shared password before the app sees
// it, so strangers and crawlers stay out without a sign-in service in front.
// A browser gets a form that remembers the password for 30 days in a cookie. A
// script sends it as an X-Staging-Password header, or with basic auth (any user
// name). Production has no APP_ENV, so there it does nothing.
//
// From the pjmgmt staging standard (mckinley/pjmgmt,
// scripts/automations/templates/staging/staging-gate.ts). Change it there,
// then copy it into each app.

export const STAGING_COOKIE = 'staging_password';
export const STAGING_HEADER = 'X-Staging-Password';
/** Where the form posts. Any other path shows the form. */
export const STAGING_FORM_PATH = '/staging-password';
const THIRTY_DAYS = 30 * 24 * 60 * 60;

export interface StagingGateEnv {
  APP_ENV?: string;
  STAGING_PASSWORD?: string;
}

const GATE_HEADERS = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  // pjmgmt's uptime check looks for this to tell the gate from a broken site
  'x-staging-gate': 'password',
};

/** null lets the request through to the app; anything else is the answer instead. */
export async function stagingGate(request: Request, env: StagingGateEnv): Promise<Response | null> {
  if (env.APP_ENV !== 'staging') return null;
  const password = env.STAGING_PASSWORD;
  if (!password)
    return plain(503, 'This staging site has no STAGING_PASSWORD yet (docs/staging.md).');
  const url = new URL(request.url);
  const pass = await passFor(password);

  if (request.method === 'POST' && url.pathname === STAGING_FORM_PATH) {
    const form = await request.formData().catch(() => null);
    const next = localPath(form?.get('next'));
    if (!same(String(form?.get('password') ?? ''), password)) return page(next, true);
    return new Response(null, {
      status: 303,
      headers: {
        ...GATE_HEADERS,
        location: next,
        'set-cookie': `${STAGING_COOKIE}=${pass}; Path=/; Max-Age=${THIRTY_DAYS}; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  if (same(cookie(request, STAGING_COOKIE), pass)) return null;
  if (same(request.headers.get(STAGING_HEADER) ?? '', password)) return null;
  if (same(basicPassword(request), password)) return null;

  const accept = request.headers.get('accept') ?? '';
  if (['GET', 'HEAD'].includes(request.method) && accept.includes('text/html'))
    return page(url.pathname + url.search, false);
  return plain(401, `Staging: send the password as ${STAGING_HEADER}, or with basic auth.`, {
    'www-authenticate': 'Basic realm="Staging", charset="UTF-8"',
  });
}

/** The cookie holds a hash of the password, never the password. A new password signs everyone out. */
async function passFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`staging-gate:${password}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares without stopping at the first difference. */
function same(given: string, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function cookie(request: Request, name: string): string {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

function basicPassword(request: Request): string {
  const [scheme, encoded] = (request.headers.get('authorization') ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'basic' || !encoded) return '';
  try {
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
    );
    const colon = decoded.indexOf(':');
    return colon === -1 ? '' : decoded.slice(colon + 1);
  } catch {
    return '';
  }
}

/** Only a path on this site, so the form can't send anyone elsewhere. */
function localPath(value: unknown): string {
  const path = typeof value === 'string' ? value : '';
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/';
}

function plain(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { ...GATE_HEADERS, 'content-type': 'text/plain; charset=utf-8', ...headers },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function page(next: string, wrong: boolean): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Staging</title>
<style>
:root { color-scheme: light dark; --bg: #f6f7f4; --card: #fff; --fg: #1d2420; --muted: #5b665f; --line: #d9ded8; --accent: #2f6f5e; --bad: #a3322b; }
@media (prefers-color-scheme: dark) { :root { --bg: #141917; --card: #1b211e; --fg: #e4e9e5; --muted: #9aa69f; --line: #2e3833; --accent: #7cc3ad; --bad: #f0928a; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { width: 100%; max-width: 360px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 24px; display: grid; gap: 14px; }
.tag { margin: 0; font: 600 12px/1 ui-monospace, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
h1 { margin: 0; font-size: 22px; }
p { margin: 0; }
form { display: grid; gap: 10px; }
label { display: grid; gap: 6px; font-weight: 600; font-size: 14px; }
input { font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
button { font: inherit; font-weight: 600; padding: 10px 12px; border: 0; border-radius: 6px; background: var(--accent); color: var(--card); cursor: pointer; }
.wrong { color: var(--bad); font-size: 14px; }
</style>
</head>
<body>
<main>
<p class="tag">Staging · fake data</p>
<h1>This is a test copy</h1>
<p>Enter the staging password to look around.</p>
<form method="post" action="${STAGING_FORM_PATH}">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<label>Password <input type="password" name="password" autocomplete="current-password" required autofocus></label>
${wrong ? '<p class="wrong" role="alert">That isn’t the staging password.</p>' : ''}
<button type="submit">Continue</button>
</form>
</main>
</body>
</html>
`;
  return new Response(html, {
    status: 401,
    headers: { ...GATE_HEADERS, 'content-type': 'text/html; charset=utf-8' },
  });
}
