// /dev/login: sign in as any test user, no password or Google. Only where
// DEV_AUTH=true: the staging copy (env.staging in wrangler.toml,
// docs/staging.md) and local .dev.vars. Everywhere else it is a 404.
import { and, eq } from 'drizzle-orm';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import type { Route } from './+types/dev.login';
import { getDb } from '~/app/lib/db.server';
import { createAuth } from '~/app/lib/auth.server';
import { account, user } from '~/db/schema';

export function meta() {
  return [{ title: 'Test users | SoarCast' }, { name: 'robots', content: 'noindex' }];
}

// Better Auth's scrypt settings, so its email sign-in accepts the hash
const SCRYPT_CONFIG = { N: 16384, r: 16, p: 1, dkLen: 64 };
const DEV_PASSWORD = 'soarcast-dev-bypass';

function requireDevAuth(env: Env) {
  if (env.DEV_AUTH !== 'true') throw new Response('Not found', { status: 404 });
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashDevPassword() {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const key = await scryptAsync(DEV_PASSWORD.normalize('NFKC'), salt, SCRYPT_CONFIG);
  return `${salt}:${toHex(key)}`;
}

export async function loader({ context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  requireDevAuth(env);
  const users = await getDb(env)
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .orderBy(user.name);
  return { users };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  requireDevAuth(env);
  const userId = (await request.formData()).get('userId');
  if (typeof userId !== 'string' || !userId) throw new Response('Missing userId', { status: 400 });

  const db = getDb(env);
  const [person] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!person) throw new Response('User not found', { status: 404 });

  // Give the user a credential account with the dev password, then sign in with it
  const password = await hashDevPassword();
  const now = new Date();
  const [credential] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .limit(1);
  if (credential) {
    await db.update(account).set({ password, updatedAt: now }).where(eq(account.id, credential.id));
  } else {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: person.email,
      providerId: 'credential',
      userId,
      password,
      createdAt: now,
      updatedAt: now,
    });
  }

  const auth = await createAuth(env);
  const signIn = await auth.api.signInEmail({
    body: { email: person.email, password: DEV_PASSWORD },
    asResponse: true,
  });
  if (!signIn.ok) throw new Response(`Sign-in failed: ${await signIn.text()}`, { status: 500 });

  const headers = new Headers({ Location: '/dashboard' });
  for (const cookie of signIn.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

export default function DevLoginPage({ loaderData }: Route.ComponentProps) {
  const { users } = loaderData;
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Test users</h1>
          <p className="text-sm text-muted-foreground">
            Sign in as any of them. Only on the staging copy and in local dev.
          </p>
        </div>
        <div className="divide-y rounded-lg border">
          {users.length === 0 && <p className="p-4 text-sm text-muted-foreground">No users yet.</p>}
          {users.map((u) => (
            <form key={u.id} method="post" className="flex items-center gap-3 p-3">
              <input type="hidden" name="userId" value={u.id} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              {u.role === 'admin' && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">admin</span>
              )}
              <button
                type="submit"
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
              >
                Sign in
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
