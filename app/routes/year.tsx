import { redirect } from 'react-router';
import type { Route } from './+types/year';

/** The page moved to /planning; old links keep their view and month. */
export function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  if (params.get('view') === 'mine') params.set('view', 'favorites');
  // ?month=N (a calendar month) is now ?from=YYYY-MM, the next time that month comes round
  const month = Number(params.get('month'));
  params.delete('month');
  if (month >= 1 && month <= 12) {
    const now = new Date();
    const year = now.getUTCFullYear() + (month < now.getUTCMonth() + 1 ? 1 : 0);
    params.set('from', `${year}-${String(month).padStart(2, '0')}`);
  }
  return redirect(params.size > 0 ? `/planning?${params}` : '/planning', 301);
}
