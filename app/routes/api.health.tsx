import type { LoaderFunctionArgs } from 'react-router';
import { eq } from 'drizzle-orm';
import { appState, getDb } from '~/app/lib/db.server';
import { getAtmosphericProfile, setProfileDb } from '~/lib/weather-profile';
import { getPgsitesApiKey, getSyncStatus, searchSites } from '~/lib/pgsites-client';

// Checks what pilots depend on. The hourly cron (worker.ts) calls this after
// the alerts run and emails when the result changes; it needs the
// CRON_SECRET bearer because it calls Open-Meteo and pgsites.

// North Bend, WA: SoarCast must always be able to forecast here.
const PROBE = { latitude: 47.49, longitude: -121.79 };
const ALERTS_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const PGSITES_MAX_SYNC_AGE_DAYS = 2;

export interface HealthCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  ok: boolean;
  checkedAt: string;
  checks: HealthCheck[];
}

/** The last alerts run, as worker.ts records it in app_state. */
export interface AlertsRun {
  at: string;
  ok: boolean;
  detail: string;
}

async function check(name: string, run: () => Promise<string>): Promise<HealthCheck> {
  try {
    return { name, ok: true, detail: await run() };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { name, ok: false, detail: detail.slice(0, 300) };
  }
}

/** Whole days between a YYYYMMDD date and now (UTC). */
function daysSince(yyyymmdd: string, now: Date): number {
  const date = Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - date) / 86_400_000);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  if (env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb(env);
  setProfileDb(db);
  const now = new Date();
  const apiKey = getPgsitesApiKey(env);

  const checks = await Promise.all([
    check('database', async () => {
      // A write, not just a read: Turso once kept reads working while refusing writes.
      await db
        .insert(appState)
        .values({ key: 'health_probe', value: now.toISOString(), updatedAt: now })
        .onConflictDoUpdate({
          target: appState.key,
          set: { value: now.toISOString(), updatedAt: now },
        });
      return 'read and write ok';
    }),
    check('forecast', async () => {
      const { profile } = await getAtmosphericProfile(PROBE.latitude, PROBE.longitude, 1);
      if (profile.hours.length === 0) throw new Error('Open-Meteo returned no hours');
      return `${profile.hours.length} hours for North Bend`;
    }),
    check('pgsites', async () => {
      const sites = await searchSites(apiKey, 'Tiger', 1);
      if (sites.length === 0) throw new Error('searching "Tiger" found no sites');
      return `search ok (${sites[0].name})`;
    }),
    check('pgsites sync', async () => {
      const status = await getSyncStatus(apiKey);
      if (!status.last_modified_check) throw new Error('the daily sync has never run');
      const age = daysSince(status.last_modified_check, now);
      if (age > PGSITES_MAX_SYNC_AGE_DAYS) {
        throw new Error(`last daily sync ${status.last_modified_check}, ${age} days ago`);
      }
      return `last daily sync ${status.last_modified_check}`;
    }),
    check('alerts', async () => {
      const [row] = await db.select().from(appState).where(eq(appState.key, 'alerts_last_run'));
      if (!row) throw new Error('alerts have not run yet');
      const last = JSON.parse(row.value) as AlertsRun;
      if (!last.ok) throw new Error(`last run at ${last.at} failed: ${last.detail}`);
      if (now.getTime() - Date.parse(last.at) > ALERTS_MAX_AGE_MS) {
        throw new Error(`last run was at ${last.at}`);
      }
      return `last run ${last.at}: ${last.detail}`;
    }),
  ]);

  const report: HealthReport = {
    ok: checks.every((c) => c.ok),
    checkedAt: now.toISOString(),
    checks,
  };
  return Response.json(report, { status: report.ok ? 200 : 503 });
}
