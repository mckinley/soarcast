import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { createAuth } from '~/app/lib/auth.server';

// Catch-all route that delegates all /auth/* requests to Better Auth
// Handles: /auth/sign-in, /auth/sign-up, /auth/sign-out, /auth/session,
// /auth/callback/google, /auth/callback/github, etc.

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  return createAuth(env).handler(request);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Env;
  return createAuth(env).handler(request);
}
