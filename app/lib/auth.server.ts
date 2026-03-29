import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from './db.server';
import { user, session, account, verification } from '@/db/auth-schema';

// Better Auth factory - creates an auth instance with the given env
// Called per-request since CF Workers pass env through context
export function createAuth(env: Env) {
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
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh when < 1 day remaining
    },
    trustedOrigins: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://soarcast.mckinleydigital.com',
      'https://soarcast.mckinley-digital-account.workers.dev',
    ],
  });
}

// Helper to get session from request headers
export async function getSession(request: Request, env: Env) {
  const auth = createAuth(env);
  return auth.api.getSession({ headers: request.headers });
}

// Helper to require auth - throws redirect if not authenticated
export async function requireAuth(request: Request, env: Env) {
  const session = await getSession(request, env);
  if (!session) {
    throw new Response(null, {
      status: 302,
      headers: { Location: '/auth/signin' },
    });
  }
  return session;
}
