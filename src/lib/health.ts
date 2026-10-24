// Pure parts of the health check (app/routes/api.health.tsx) and its email
// (worker.ts), kept here so they can be tested.

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
