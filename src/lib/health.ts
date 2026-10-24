// Pure parts of the health check (app/lib/health.server.ts), its email
// (worker.ts) and the public /api/health, kept here so they can be tested.

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

/** app_state key of the hourly cron's last full report (worker.ts), which /api/health reads. */
export const HEALTH_REPORT_KEY = 'health_last_report';

/** The cron runs hourly, so a report older than two hours means it stopped. */
export const HEALTH_REPORT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** What /api/health tells anyone: check names and results, never their details. */
export interface PublicHealth {
  status: 'ok' | 'failing' | 'stale';
  checkedAt: string | null;
  checks: { name: string; ok: boolean }[];
}

/** The public answer from the cron's last report: 200 only when it is ok and recent. */
export function publicHealth(
  report: HealthReport | null,
  now: Date,
): { httpStatus: number; body: PublicHealth } {
  if (!report) return { httpStatus: 503, body: { status: 'stale', checkedAt: null, checks: [] } };
  const checks = report.checks.map(({ name, ok }) => ({ name, ok }));
  const stale = now.getTime() - Date.parse(report.checkedAt) > HEALTH_REPORT_MAX_AGE_MS;
  const status = stale ? 'stale' : report.ok ? 'ok' : 'failing';
  return {
    httpStatus: status === 'ok' ? 200 : 503,
    body: { status, checkedAt: report.checkedAt, checks },
  };
}

/** pgsites' newest daily sync, as its /api/sync/status gives it (`last_incremental`). */
export interface PgsitesSyncRun {
  status: string;
  /** Unix seconds */
  started_at: number;
  /** What Paragliding Earth answered, when the run got an answer */
  status_code: number | null;
  error_message: string | null;
}

/**
 * Why pgsites' newest daily sync failed, to add to the stale-sync detail:
 * Paragliding Earth down is not ours to fix, a run that failed on its own is.
 */
export function syncFailureNote(run: PgsitesSyncRun | null | undefined): string {
  if (!run || run.status !== 'failed') return '';
  const at = new Date(run.started_at * 1000).toISOString().slice(0, 16).replace('T', ' ');
  if (run.status_code) {
    return `. Paragliding Earth answered ${run.status_code} at ${at} UTC, so pgsites keeps its last copy`;
  }
  return `. The run at ${at} UTC failed: ${run.error_message ?? 'no reason given'}`;
}

/**
 * The state worker.ts keeps and emails on when it changes: "ok", or the
 * failing checks by name. A new problem then emails even while another one
 * already fails (a days-long outage upstream would otherwise hide it).
 */
export function healthState(failing: string[]): string {
  return failing.length === 0 ? 'ok' : `failing: ${[...failing].sort().join(', ')}`;
}
