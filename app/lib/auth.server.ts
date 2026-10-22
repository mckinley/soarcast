import { getDb } from './db.server';
import { user, session, account, verification } from '@/db/auth-schema';
import { settings } from '@/db/schema';

// Better Auth is loaded on first use, not when the Worker starts: it is the
// largest part of a fresh start, and visitors who aren't signed in never
// need it.
async function buildAuth(env: Env) {
  const [{ betterAuth }, { drizzleAdapter }] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/drizzle'),
  ]);
  const db = getDb(env);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user, session, account, verification },
    }),
    basePath: '/api/auth',
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: {
      google: {
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
      },
      github: {
        clientId: env.AUTH_GITHUB_ID,
        clientSecret: env.AUTH_GITHUB_SECRET,
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Every pilot gets a settings row at sign-up: alerts read it
          after: async (newUser) => {
            await db.insert(settings).values({ userId: newUser.id }).onConflictDoNothing();
          },
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh when < 1 day remaining
    },
    trustedOrigins: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://soarcast.mckinleydigital.com',
    ],
  });
}

type Auth = Awaited<ReturnType<typeof buildAuth>>;
export type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;

// One Better Auth instance per Worker instance, like getDb: building one
// costs CPU, and nothing in it belongs to a single request.
let cached: { binding: D1Database; auth: Promise<Auth> } | null = null;

export function createAuth(env: Env): Promise<Auth> {
  if (!cached || cached.binding !== env.DB) {
    const auth = buildAuth(env);
    cached = { binding: env.DB, auth };
    // A failed build is tried again on the next request
    auth.catch(() => {
      if (cached?.auth === auth) cached = null;
    });
  }
  return cached.auth;
}

/** Better Auth's session cookie, with the __Secure- prefix it uses over https. */
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]*)/;

/** The request's session cookie value, or null when there is none. */
export function sessionCookie(request: Request): string | null {
  return SESSION_COOKIE.exec(request.headers.get('cookie') ?? '')?.[1] || null;
}

// The root, layout and page loaders of one page load each ask for the
// session, each with its own copy of the request but the same env object:
// worker.ts hands every request its own env. One lookup answers them all,
// and nothing is shared between requests.
const sessionsByRequest = new WeakMap<object, Map<string, Promise<Session | null>>>();

/** The signed-in pilot's session, or null. Visitors without a session cookie never load Better Auth. */
export function getSession(request: Request, env: Env): Promise<Session | null> {
  const cookie = sessionCookie(request);
  if (!cookie) return Promise.resolve(null);
  let sessions = sessionsByRequest.get(env);
  if (!sessions) {
    sessions = new Map();
    sessionsByRequest.set(env, sessions);
  }
  let session = sessions.get(cookie);
  if (!session) {
    session = createAuth(env).then((auth) => auth.api.getSession({ headers: request.headers }));
    sessions.set(cookie, session);
  }
  return session;
}

// Helper to require auth - throws redirect if not authenticated
export async function requireAuth(request: Request, env: Env): Promise<Session> {
  const session = await getSession(request, env);
  if (!session) {
    throw new Response(null, {
      status: 302,
      headers: { Location: '/auth/signin' },
    });
  }
  return session;
}
