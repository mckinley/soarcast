// Season build: rates every day of the last SEASON_YEARS years at each site,
// the same way today's forecast is rated, and writes the season to
// site_seasons for site pages and the Planning page. Sites: every followed
// and custom site, then the destinations in src/lib/destinations.ts.
//
// A Cloudflare Workflow, started twice a day by this Worker's cron (index.ts)
// or by hand (the "Cloudflare job" workflow on GitHub). The weather is ERA5,
// ECMWF's record of past weather, read from Open-Meteo's open copy on Amazon
// (src/lib/season-build/era5.ts): no account and no rate limit. Each ERA5
// cell is a step per five years, so launches in the same cell share one
// read, then a step that joins and writes them. A step that fails is tried
// again. Only each site's time zone comes from
// Open-Meteo's API (one small call).

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { customSites, launchSites, siteSeasons, userFavoriteSites } from '../src/db/schema';
import { ENGINE_VERSION } from '../src/lib/forecast-engine';
import { launchSiteToSite } from '../src/lib/launch-sites';
import { customSiteToSite } from '../src/lib/custom-sites';
import { DESTINATIONS } from '../src/lib/destinations';
import {
  bestMonths,
  decodeSeasonDays,
  encodeSeasonDays,
  seasonStats,
  statsMonths,
  statsSpread,
  type SeasonDay,
  type SeasonStats,
} from '../src/lib/seasons';
import {
  daysIn,
  destinationJob,
  errorText,
  findDestinationSite,
  jobFor,
  jobTag,
  rateSite,
  recordRange,
  seasonRange,
  timeZoneAt,
  ymd,
  type DayRange,
  type Job,
  type PgRow,
} from '../src/lib/season-build/core';
import { SEASON_BUILD_STATE_KEY, type SeasonBuildRun } from '../src/lib/season-build/run';
import { era5Cell, era5Series, HOUR_MS, missing } from '../src/lib/season-build/era5';
import type { JobsEnv } from './env';

const SOURCE = 'era5';
/** A site's season is rebuilt once its last month is this many months old. */
const REBUILD_AFTER_MONTHS = 2;
/** A Worker waits on at most six connections at a time; more only queue. */
const READS_AT_ONCE = 6;
/**
 * Years a step reads and rates. A Worker has 128 MB, and reading and rating
 * all 20 years at once ran out of it.
 */
const BLOCK_YEARS = 5;
/** Sites a dry run rates when no limit is given. */
const DRY_RUN_SITES = 4;

export interface SeasonBuildParams {
  /** Rate a few destinations and write nothing */
  dryRun?: boolean;
  /** Build at most this many sites */
  limit?: number;
}

interface Plan {
  startedAt: string;
  range: DayRange;
  recent: DayRange;
  sites: number;
  due: number;
  /** Due jobs by ERA5 cell, so a cell's launches share one read */
  cells: Array<{ cell: string; jobs: Job[] }>;
}

interface CellResult {
  lines: string[];
  built: number;
  skipped: number;
}

/** A block of years at a cell: each launch's days, encoded (encodeSeasonDays). */
interface BlockResult {
  lines: string[];
  days: Record<string, string>;
}

async function ownJobs(env: JobsEnv): Promise<Job[]> {
  const db = drizzle(env.DB, { schema });
  const [followed, customs] = await Promise.all([
    db
      .select({ favorite: userFavoriteSites, site: launchSites })
      .from(userFavoriteSites)
      .innerJoin(launchSites, eq(launchSites.id, userFavoriteSites.siteId)),
    db.select().from(customSites),
  ]);
  const jobs = [
    ...followed.map((f) =>
      jobFor(`pg:${f.site.pgsitesId}`, launchSiteToSite(f.site, f.favorite), {
        label: 'followed site',
        name: f.site.name,
        countryCode: f.site.countryCode?.toLowerCase() ?? null,
        destination: null,
      }),
    ),
    ...customs.map((c) =>
      jobFor(`custom:${c.id}`, customSiteToSite(c), {
        label: 'your own site',
        name: null,
        countryCode: null,
        destination: null,
      }),
    ),
  ];
  return [...new Map(jobs.map((j) => [j.key, j])).values()];
}

async function destinationJobs(env: JobsEnv): Promise<Job[]> {
  const query = async (sql: string, params: unknown[]) =>
    (
      await env.PGSITES.prepare(sql)
        .bind(...params)
        .all<PgRow>()
    ).results;
  const jobs: Job[] = [];
  for (const dest of DESTINATIONS) {
    const row = await findDestinationSite(query, dest);
    if (row) jobs.push(destinationJob(dest, row));
    else console.log(`destination ${dest.slug}: no listed launch found near it`);
  }
  return jobs;
}

/** Every site, and the ones whose season is missing, old or rated by an older engine. */
async function plan(env: JobsEnv, params: SeasonBuildParams): Promise<Plan> {
  const now = new Date();
  const range = recordRange(now);
  const recent = seasonRange(now);
  const db = drizzle(env.DB, { schema });

  const built = new Map<string, { toDate: string; engineVersion: number; source: string | null }>();
  if (!params.dryRun) {
    for (const r of await db
      .select({
        key: siteSeasons.key,
        toDate: siteSeasons.toDate,
        engineVersion: siteSeasons.engineVersion,
        source: siteSeasons.source,
      })
      .from(siteSeasons)) {
      built.set(r.key, r);
    }
  }
  const staleBefore = ymd(
    new Date(
      Date.UTC(
        Number(range.to.slice(0, 4)),
        Number(range.to.slice(5, 7)) - REBUILD_AFTER_MONTHS,
        0,
      ),
    ),
  );

  // A dry run rates public destinations only
  const jobs = [...(params.dryRun ? [] : await ownJobs(env)), ...(await destinationJobs(env))];
  const due = jobs.filter((j) => {
    const row = built.get(j.key);
    return (
      !row ||
      row.source !== SOURCE ||
      row.toDate < staleBefore ||
      row.engineVersion < ENGINE_VERSION
    );
  });
  const limit = params.limit ?? (params.dryRun ? DRY_RUN_SITES : Infinity);
  const cells = new Map<string, Job[]>();
  for (const job of due.slice(0, limit)) {
    const { key } = era5Cell(job.site.latitude, job.site.longitude);
    cells.set(key, [...(cells.get(key) ?? []), job]);
  }
  console.log(
    `Season ${range.from} to ${range.to} from ERA5 (days kept one by one from ${recent.from}): ` +
      `${jobs.length} sites, ${due.length} due${params.dryRun ? ', dry run' : ''}`,
  );
  return {
    startedAt: now.toISOString(),
    range,
    recent,
    sites: jobs.length,
    due: due.length,
    cells: [...cells].map(([cell, cellJobs]) => ({ cell, jobs: cellJobs })),
  };
}

async function writeSeason(
  env: JobsEnv,
  job: Job,
  days: SeasonDay[],
  stats: SeasonStats,
  recent: DayRange,
) {
  const row = {
    key: job.key,
    siteRef: job.siteRef,
    name: job.name,
    countryCode: job.countryCode,
    latitude: job.site.latitude,
    longitude: job.site.longitude,
    destination: job.destination,
    days: encodeSeasonDays(days.filter((d) => d.date >= recent.from)),
    fromDate: days[0].date,
    toDate: days[days.length - 1].date,
    builtAt: new Date(),
    engineVersion: ENGINE_VERSION,
    source: SOURCE,
    summary: JSON.stringify(stats),
  };
  await drizzle(env.DB, { schema })
    .insert(siteSeasons)
    .values(row)
    .onConflictDoUpdate({ target: siteSeasons.key, set: row });
}

/** The range in blocks of BLOCK_YEARS calendar years, so a step holds a few years at a time. */
function blocks({ from, to }: DayRange): DayRange[] {
  const out: DayRange[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y += BLOCK_YEARS) {
    const blockFrom = `${y}-01-01` < from ? from : `${y}-01-01`;
    const blockTo = `${y + BLOCK_YEARS - 1}-12-31` > to ? to : `${y + BLOCK_YEARS - 1}-12-31`;
    out.push({ from: blockFrom, to: blockTo });
  }
  return out;
}

/** Reads a block of years of one ERA5 cell and rates each of its launches over it. */
async function rateBlock(
  { cell, jobs }: Plan['cells'][number],
  block: DayRange,
): Promise<BlockResult> {
  // ERA5 hours from the first local day to the last, with half a day either side
  const fromMs = Date.parse(`${block.from}T00:00:00Z`) - 14 * HOUR_MS;
  const toMs = Date.parse(`${block.to}T23:00:00Z`) + 14 * HOUR_MS;
  const t0 = Date.now();
  const { latitude, longitude } = jobs[0].site;
  const series = await era5Series(latitude, longitude, fromMs, toMs, READS_AT_ONCE);
  const result: BlockResult = {
    lines: [
      `cell ${cell}, ${block.from.slice(0, 4)} to ${block.to.slice(0, 4)}: ERA5 read in ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    ],
    days: {},
  };
  if (missing.size > 0)
    result.lines.push(`  files missing from the bucket: ${[...missing].join(', ')}`);
  for (const job of jobs) {
    const timeZone = await timeZoneAt(job.site.latitude, job.site.longitude);
    result.days[job.key] = encodeSeasonDays(rateSite(job, series, timeZone, block));
  }
  for (const line of result.lines) console.log(line);
  return result;
}

/** Joins a cell's blocks into each launch's season and writes it. */
async function writeCell(
  env: JobsEnv,
  { jobs }: Plan['cells'][number],
  rated: BlockResult[],
  { range, recent }: Plan,
  dryRun: boolean,
): Promise<CellResult> {
  const result: CellResult = { lines: [], built: 0, skipped: 0 };
  const expected = daysIn(range);
  for (const job of jobs) {
    const days = rated.flatMap((b) => decodeSeasonDays(b.days[job.key] ?? ''));
    const stats = seasonStats(days);
    const goal = job.site.goal ?? 'soar';
    const months = statsMonths(stats, goal);
    const spread = statsSpread(stats, goal);
    result.lines.push(
      `${jobTag(job)}: ${days.length} of ${expected} days rated; ` +
        `go for its goal (${goal}) by month: ${months.map((m) => Math.round(m.goShare * 100)).join(' ')}; ` +
        `best ${bestMonths(months)?.text ?? 'none'}; go days in most years: ${spread.map((s) => (s ? `${s.low}-${s.high}` : '?')).join(' ')}`,
    );
    // A record with big holes would read as a season it isn't
    if (days.length < expected * 0.8) {
      result.lines.push('  skipped: too few days rated');
      result.skipped++;
      continue;
    }
    if (!dryRun) await writeSeason(env, job, days, stats, recent);
    result.built++;
  }
  for (const line of result.lines) console.log(line);
  return result;
}

export class SeasonBuild extends WorkflowEntrypoint<JobsEnv, SeasonBuildParams> {
  async run(event: WorkflowEvent<SeasonBuildParams>, step: WorkflowStep) {
    const params = event.payload ?? {};
    const dryRun = !!params.dryRun;
    const planned = await step.do('plan', () => plan(this.env, params));

    let built = 0;
    let skipped = 0;
    const failed: string[] = [];
    const tries = {
      retries: { limit: 2, delay: '1 minute', backoff: 'exponential' },
      timeout: '30 minutes',
    } as const;
    for (const group of planned.cells) {
      try {
        const rated: BlockResult[] = [];
        for (const block of blocks(planned.range)) {
          rated.push(
            await step.do(`cell ${group.cell} ${block.from.slice(0, 4)}`, tries, () =>
              rateBlock(group, block),
            ),
          );
        }
        const result = await step.do(`cell ${group.cell} write`, tries, () =>
          writeCell(this.env, group, rated, planned, dryRun),
        );
        built += result.built;
        skipped += result.skipped;
      } catch (error) {
        // Tried three times: leave it for the next run
        console.log(`cell ${group.cell}: failed, ${errorText(error)}`);
        failed.push(...group.jobs.map(jobTag));
      }
    }

    return step.do('record', async () => {
      const run: SeasonBuildRun = {
        instance: event.instanceId,
        startedAt: planned.startedAt,
        finishedAt: new Date().toISOString(),
        sites: planned.sites,
        due: planned.due,
        built,
        skipped,
        failed,
        dryRun,
      };
      console.log(
        `Built ${built} of ${planned.due} due sites` +
          (failed.length > 0 ? `, ${failed.length} failed: ${failed.join(', ')}` : ''),
      );
      if (!dryRun) {
        await this.env.DB.prepare(
          `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, unixepoch())
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
          .bind(SEASON_BUILD_STATE_KEY, JSON.stringify(run))
          .run();
      }
      return run;
    });
  }
}
