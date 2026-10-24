import type { LoaderFunctionArgs } from 'react-router';
import { eq } from 'drizzle-orm';
import { appState, getDb } from '~/app/lib/db.server';
import { HEALTH_REPORT_KEY, publicHealth, type HealthReport } from '~/lib/health';

// GET /api/health: public, for uptime monitors (pjmgmt's among them). It
// answers from the hourly cron's last report (worker.ts), so it costs one
// read and starts no checks: 200 when every check passed within the last two
// hours, else 503. Names and results only; the details are on
// /api/admin/health.
export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const [row] = await getDb(env).select().from(appState).where(eq(appState.key, HEALTH_REPORT_KEY));
  const report = row ? (JSON.parse(row.value) as HealthReport) : null;
  const { httpStatus, body } = publicHealth(report, new Date());
  return Response.json(body, {
    status: httpStatus,
    headers: { 'Cache-Control': 'public, max-age=60' },
  });
}
