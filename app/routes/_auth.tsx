import { Outlet } from 'react-router';
import type { Route } from './+types/_auth';
import { requireAuth } from '~/app/lib/auth.server';

// Protected layout - all child routes require authentication.
// If not authenticated, redirects to /auth/signin.

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  return { user: session.user };
}

export default function AuthLayout() {
  return <Outlet />;
}
