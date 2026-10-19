import { createRequestHandler, type ServerBuild } from 'react-router';

declare module 'react-router' {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

// Import the built server bundle directly
import * as serverBuild from './build/server/index.js';
import type { AlertsRun, HealthReport } from './app/routes/api.health';

const requestHandler = createRequestHandler(serverBuild as unknown as ServerBuild, 'production');

async function getState(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT value FROM app_state WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function setState(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, value)
    .run();
}

/**
 * Email HEALTH_ALERT_TO when the health check turns failing or recovers, not
 * every hour. If the database is down the previous state can't be read, so
 * that outage emails every hour.
 */
async function notifyHealthChange(env: Env, healthy: boolean, report: HealthReport | null) {
  const status = healthy ? 'ok' : 'failing';
  const previous = await getState(env.DB, 'health_status').catch(() => null);
  await setState(env.DB, 'health_status', status).catch(() => undefined);
  if (status === (previous ?? 'ok')) return;

  if (!env.HEALTH_ALERT_TO) {
    console.error(`Health is ${status}, but HEALTH_ALERT_TO is not set, so no email went out`);
    return;
  }
  const failing = report?.checks.filter((c) => !c.ok).map((c) => c.name) ?? ['health check'];
  const lines = report
    ? report.checks.map((c) => `${c.ok ? 'OK  ' : 'FAIL'} ${c.name}: ${c.detail}`)
    : ['The health check itself failed to answer.'];
  try {
    await env.EMAIL.send({
      from: { name: 'SoarCast', email: 'soarcast@mckinleyaviation.com' },
      to: env.HEALTH_ALERT_TO,
      subject: healthy
        ? 'SoarCast is healthy again'
        : `SoarCast needs attention: ${failing.join(', ')}`,
      text: [...lines, '', `Checked at ${report?.checkedAt ?? new Date().toISOString()}.`].join(
        '\n',
      ),
    });
  } catch (error) {
    console.error('Could not email the health change:', error);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },

  // Hourly cron (wrangler.toml): run the alerts check, which decides whose
  // morning or evening run is due in their local time, then the health check.
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const context = { cloudflare: { env, ctx } };
    const headers = { authorization: `Bearer ${env.CRON_SECRET}` };

    const alerts = await requestHandler(
      new Request(new URL('/api/notifications/check', env.BETTER_AUTH_URL), {
        method: 'POST',
        headers,
      }),
      context,
    );
    const alertsBody = await alerts.text();
    console.log(`Alerts check: ${alerts.status} ${alertsBody}`);
    const alertsRun: AlertsRun = {
      at: new Date().toISOString(),
      ok: alerts.ok,
      detail: alertsBody.slice(0, 300),
    };
    await setState(env.DB, 'alerts_last_run', JSON.stringify(alertsRun)).catch((error) =>
      console.error('Could not record the alerts run:', error),
    );

    const health = await requestHandler(
      new Request(new URL('/api/health', env.BETTER_AUTH_URL), { headers }),
      context,
    );
    const report = (await health.json().catch(() => null)) as HealthReport | null;
    const healthy = health.ok && report?.ok === true;
    console.log(`Health check: ${health.status} ${JSON.stringify(report)}`);
    await notifyHealthChange(env, healthy, report);

    if (!alerts.ok) throw new Error(`Alerts check failed: ${alerts.status} ${alertsBody}`);
    if (!healthy) throw new Error('Health check failed');
  },
} satisfies ExportedHandler<Env>;
