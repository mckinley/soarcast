import type { ActionFunctionArgs } from 'react-router';
import { getDb } from '~/app/lib/db.server';
import { refreshSavedForecasts } from '~/app/lib/forecast-refresh.server';

/**
 * The hourly cron's first step (worker.ts): fetch new forecasts for saved
 * sites before their copy expires. CRON_SECRET bearer only.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Env;
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return Response.json(await refreshSavedForecasts(getDb(env)));
  } catch (error) {
    console.error('Refreshing saved forecasts failed:', error);
    return Response.json(
      { error: error instanceof Error ? error.message.slice(0, 300) : 'Refresh failed' },
      { status: 500 },
    );
  }
}
