import { createRequestHandler, type ServerBuild } from 'react-router';

declare module 'react-router' {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
      /** Where the request comes from, roughly (missing for the cron's own requests) */
      cf?: IncomingRequestCfProperties;
    };
  }
}

// Import the built server bundle directly
import * as serverBuild from './build/server/index.js';
import {
  serverTimingHeader,
  timedD1,
  timedPage,
  timeOutgoingFetches,
  withRequestTiming,
  type RequestTiming,
} from './src/lib/request-timing';
import { logErrorsAsText } from './src/lib/error-text';
import { configurePgsites } from './src/lib/pgsites-client';
import { canonicalRedirect } from './src/lib/canonical-url';
import { stagingGate } from './src/lib/staging-gate';
import {
  HEALTH_REPORT_KEY,
  healthState,
  type AlertsRun,
  type HealthReport,
} from './src/lib/health';

const requestHandler = createRequestHandler(serverBuild as unknown as ServerBuild, 'production');
timeOutgoingFetches();
logErrorsAsText();

/** Rows kept in request_timings; older ones are deleted now and then. */
const TIMINGS_KEPT = 2000;

/** Keeps one row per page load, so slow pages can be found later. */
async function recordTiming(
  db: D1Database,
  page: string,
  status: number,
  signedIn: boolean,
  timing: RequestTiming,
  totalMs: number,
  colo: string | null,
) {
  try {
    await db
      .prepare(
        `INSERT INTO request_timings (page, status, signed_in, cold, total_ms, d1_count, d1_ms, calls, colo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        page,
        status,
        signedIn ? 1 : 0,
        timing.cold ? 1 : 0,
        totalMs,
        timing.d1.count,
        timing.d1.ms,
        JSON.stringify(Object.fromEntries(timing.calls)),
        colo,
      )
      .run();
    if (Math.random() < 0.05) {
      await db
        .prepare(
          'DELETE FROM request_timings WHERE id <= (SELECT MAX(id) FROM request_timings) - ?',
        )
        .bind(TIMINGS_KEPT)
        .run();
    }
  } catch (error) {
    console.error('Could not record a request timing:', error);
  }
}

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
 * Email HEALTH_ALERT_TO when the set of failing checks changes (one starts
 * failing, or all recover), not every hour. Keyed by the failing checks, a
 * new problem emails even while an older one still fails. If the database is
 * down the previous state can't be read, so that outage emails every hour.
 */
async function notifyHealthChange(env: Env, healthy: boolean, report: HealthReport | null) {
  const failedChecks = report?.checks.filter((c) => !c.ok).map((c) => c.name) ?? [];
  const failing = healthy ? [] : failedChecks.length > 0 ? failedChecks : ['health check'];
  const status = healthState(failing);
  const previous = await getState(env.DB, 'health_status').catch(() => null);
  await setState(env.DB, 'health_status', status).catch(() => undefined);
  if (status === (previous ?? 'ok')) return;

  if (!env.HEALTH_ALERT_TO || !env.EMAIL) {
    console.error(
      `Health is ${status}, but HEALTH_ALERT_TO or EMAIL is not set, so no email went out`,
    );
    return;
  }
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
    // Staging only (docs/staging.md): the shared staging password comes first
    const gate = await stagingGate(request, env);
    if (gate) return gate;
    // One page, one address (pjmgmt's canonical-urls standard): /Sites/ is /sites
    const moved = canonicalRedirect(request);
    if (moved) return moved;
    const cf = request.cf as IncomingRequestCfProperties | undefined;
    configurePgsites(env);
    return withRequestTiming(async (timing) => {
      // Each request gets its own env object: getSession looks the session
      // up once per request by it (app/lib/auth.server.ts)
      const response = await requestHandler(request, {
        cloudflare: { env: { ...env, DB: timedD1(env.DB) }, ctx, cf },
      });
      const totalMs = Date.now() - timing.start;
      const headers = new Headers(response.headers);
      headers.append('Server-Timing', serverTimingHeader(timing, totalMs));
      // The staging copy (docs/staging.md) stays out of search results
      if (env.APP_ENV === 'staging') headers.set('X-Robots-Tag', 'noindex, nofollow');
      const page = request.method === 'GET' ? timedPage(new URL(request.url)) : null;
      if (page) {
        const signedIn = /session_token=/.test(request.headers.get('cookie') ?? '');
        ctx.waitUntil(
          recordTiming(env.DB, page, response.status, signedIn, timing, totalMs, cf?.colo ?? null),
        );
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    });
  },

  // Hourly cron (wrangler.toml): refresh saved sites' forecasts before they
  // expire, run the alerts check, which decides whose morning or evening run
  // is due in their local time, then the health check.
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    configurePgsites(env);
    const context = { cloudflare: { env, ctx } };
    const headers = { authorization: `Bearer ${env.CRON_SECRET}` };

    // A failed refresh only means pages fetch for themselves, so it never stops the alerts
    const refresh = await requestHandler(
      new Request(new URL('/api/forecasts/refresh', env.BETTER_AUTH_URL), {
        method: 'POST',
        headers,
      }),
      context,
    ).catch((error: unknown) => new Response(String(error), { status: 500 }));
    console.log(`Forecast refresh: ${refresh.status} ${await refresh.text()}`);

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
      new Request(new URL('/api/admin/health', env.BETTER_AUTH_URL), { headers }),
      context,
    );
    const report = (await health.json().catch(() => null)) as HealthReport | null;
    const healthy = health.ok && report?.ok === true;
    console.log(`Health check: ${health.status} ${JSON.stringify(report)}`);
    // The public /api/health answers from this report
    if (report?.checks) {
      await setState(env.DB, HEALTH_REPORT_KEY, JSON.stringify(report)).catch((error) =>
        console.error('Could not record the health report:', error),
      );
    }
    await notifyHealthChange(env, healthy, report);

    if (!alerts.ok) throw new Error(`Alerts check failed: ${alerts.status} ${alertsBody}`);
    if (!healthy) throw new Error('Health check failed');
  },
} satisfies ExportedHandler<Env>;
