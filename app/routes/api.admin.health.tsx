import type { LoaderFunctionArgs } from 'react-router';
import { requireAdmin } from '~/app/lib/auth.server';
import { runHealthChecks } from '~/app/lib/health.server';

// GET /api/admin/health: every check, run now, with its detail. The hourly
// cron (worker.ts) and the Health workflow call it with the CRON_SECRET
// bearer; a signed-in admin can open it too. 200 when all pass, else 503.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const bearer =
    env.CRON_SECRET && request.headers.get('authorization') === `Bearer ${env.CRON_SECRET}`;
  if (!bearer) await requireAdmin(request, env);
  const report = await runHealthChecks(env);
  return Response.json(report, { status: report.ok ? 200 : 503 });
}
