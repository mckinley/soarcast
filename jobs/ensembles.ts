// Ensembles: once a day, ECMWF's 51-run forecast at every followed and
// private site, each run rated at the launch through the forecast engine
// (src/lib/ensembles.ts). Written to site_ensembles for the experiment "How
// sure" on site pages, and to ensemble_history so it can be scored against
// flown days later. Launches in the same 0.25° square share one fetch.
//
// A Cloudflare Workflow, started each morning by this Worker's cron
// (index.ts) or by hand (the "Cloudflare job" workflow on GitHub). Open-Meteo
// counts each fetch as about 56 calls of its free daily allowance, so the
// fetches are spaced out and a run fetches at most MAX_CELLS squares.

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import type { BatchItem } from 'drizzle-orm/batch';
import { lt, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { ensembleHistory, siteEnsembles } from '../src/db/schema';
import { launchProfileFromSite } from '../src/lib/forecast-engine';
import { ensembleUrl, rateEnsemble, type EnsembleResponse } from '../src/lib/ensembles';
import { errorText, fetchRetrying, jobTag, type Job } from '../src/lib/season-build/core';
import type { Site } from '../src/types';
import type { JobsEnv } from './env';
import { ownJobs } from './own-sites';

export const ENSEMBLE_STATE_KEY = 'ensemble_last_run';
/**
 * About 56 Open-Meteo calls each: 60 squares are about a third of the free
 * 10,000 a day, which the main forecasts share.
 */
const MAX_CELLS = 60;
/** Ensemble days kept for scoring. */
const HISTORY_DAYS = 800;

export interface EnsembleParams {
  /** Fetch at most this many squares */
  limit?: number;
}

interface CellJob {
  key: string;
  siteRef: string;
  site: Site;
  tag: string;
}

interface Cell {
  key: string;
  latitude: number;
  longitude: number;
  jobs: CellJob[];
}

/** Launches grouped by the 0.25° square the ensemble gives them. */
function cellsFor(jobs: Job[]): Cell[] {
  const cells = new Map<string, Cell>();
  for (const job of jobs) {
    const key = `${Math.round(job.site.latitude * 4)}:${Math.round(job.site.longitude * 4)}`;
    const cell = cells.get(key) ?? {
      key,
      latitude: job.site.latitude,
      longitude: job.site.longitude,
      jobs: [],
    };
    cell.jobs.push({ key: job.key, siteRef: job.siteRef, site: job.site, tag: jobTag(job) });
    cells.set(key, cell);
  }
  return [...cells.values()];
}

async function rateCell(env: JobsEnv, cell: Cell): Promise<{ lines: string[] }> {
  const res = await fetchRetrying(ensembleUrl(cell.latitude, cell.longitude));
  // A 429 or a 5xx throws, so the step is tried again later
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as EnsembleResponse;
  const today = data.hourly.time[0]?.slice(0, 10);
  if (!today) throw new Error('Open-Meteo sent no hours');
  const fetchedAt = new Date();
  const db = drizzle(env.DB, { schema });
  const lines: string[] = [];
  const writes: BatchItem<'sqlite'>[] = cell.jobs.flatMap((job) => {
    const days = rateEnsemble(data, launchProfileFromSite(job.site));
    const third = days[2];
    lines.push(
      third
        ? `${job.tag}: ${days.length} days; in 2 days flyable in ${third.go} of ${third.runs} runs`
        : `${job.tag}: ${days.length} days`,
    );
    const lead = (date: string) =>
      Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5);
    return [
      db
        .insert(siteEnsembles)
        .values({
          key: job.key,
          siteRef: job.siteRef,
          timeZone: data.timezone,
          fetchedAt,
          days: JSON.stringify(days),
        })
        .onConflictDoUpdate({
          target: siteEnsembles.key,
          set: { timeZone: data.timezone, fetchedAt, days: JSON.stringify(days) },
        }),
      // 8 columns a row: 10 days stay under D1's 100 bound parameters
      ...(days.length > 0
        ? [
            db
              .insert(ensembleHistory)
              .values(
                days.map((d) => ({
                  key: job.key,
                  date: d.date,
                  leadDays: lead(d.date),
                  runs: d.runs,
                  go: d.go,
                  marginal: d.marginal,
                  no: d.no,
                  fetchedAt,
                })),
              )
              .onConflictDoUpdate({
                target: [ensembleHistory.key, ensembleHistory.date, ensembleHistory.leadDays],
                set: {
                  runs: sql`excluded.runs`,
                  go: sql`excluded.go`,
                  marginal: sql`excluded.marginal`,
                  no: sql`excluded.no`,
                  fetchedAt: sql`excluded.fetched_at`,
                },
              }),
          ]
        : []),
    ];
  });
  if (writes.length > 0) await db.batch(writes as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return { lines };
}

export class EnsembleRefresh extends WorkflowEntrypoint<JobsEnv, EnsembleParams> {
  async run(event: WorkflowEvent<EnsembleParams>, step: WorkflowStep) {
    const startedAt = new Date().toISOString();
    const cells = await step.do('plan', async () => {
      const all = cellsFor(await ownJobs(this.env));
      const limit = Math.min(event.payload?.limit ?? MAX_CELLS, MAX_CELLS);
      return { all: all.length, cells: all.slice(0, limit) };
    });
    const failed: string[] = [];
    let fetched = 0;
    for (const [i, cell] of cells.cells.entries()) {
      // Open-Meteo allows 600 calls a minute: about ten squares
      if (i > 0) await step.sleep(`pause ${cell.key}`, '10 seconds');
      try {
        await step.do(
          `cell ${cell.key}`,
          { retries: { limit: 3, delay: '2 minutes', backoff: 'exponential' }, timeout: '5 minutes' },
          () => rateCell(this.env, cell),
        );
        fetched++;
      } catch (error) {
        console.log(`cell ${cell.key} failed: ${errorText(error)}`);
        failed.push(...cell.jobs.map((j) => j.tag));
      }
    }
    await step.do('record', async () => {
      const db = drizzle(this.env.DB, { schema });
      const cutoff = new Date(Date.now() - HISTORY_DAYS * 864e5);
      await db.delete(ensembleHistory).where(lt(ensembleHistory.fetchedAt, cutoff));
      const run = {
        instance: event.instanceId,
        startedAt,
        finishedAt: new Date().toISOString(),
        squares: cells.all,
        fetched,
        failed,
      };
      await this.env.DB.prepare(
        `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
        .bind(ENSEMBLE_STATE_KEY, JSON.stringify(run))
        .run();
      return run;
    });
  }
}
