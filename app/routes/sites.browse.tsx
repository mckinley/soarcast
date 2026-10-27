import { redirect } from 'react-router';
import type { Route } from './+types/sites.browse';

// The Sites page lived here as Browse sites. Old links and bookmarks keep working.
export function loader({ request }: Route.LoaderArgs) {
  throw redirect(`/sites${new URL(request.url).search}`, 301);
}
