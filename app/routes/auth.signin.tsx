import type { Route } from './+types/auth.signin';

// Sign-in moved to /login, the path the other apps use too (the pjmgmt auth
// standard). Old links and bookmarks still land there.
export function loader({ request }: Route.LoaderArgs) {
  const { search } = new URL(request.url);
  throw new Response(null, { status: 301, headers: { Location: `/login${search}` } });
}
