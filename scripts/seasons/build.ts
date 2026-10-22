// Season build: rates every day of the last SEASON_YEARS years at each site,
// the same way today's forecast is rated, and writes the season to
// site_seasons in the soarcast D1 for site pages and the Planning page.
// Sites: every followed and custom site, then the destinations in
// src/lib/destinations.ts.
//
// The weather is ERA5, ECMWF's record of past weather, read from Open-Meteo's
// open copy on Amazon (scripts/seasons/era5.ts): no account and no rate limit,
// about half a minute a site. Launches in the same ERA5 cell share one read.
// Only each site's time zone comes from Open-Meteo's API (one small call).
// Runs in the "Season build" workflow. The repo is public, so the log names
// listed destinations only; your own sites show as a short key.
//
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID; SEASON_MINUTES (default
// 75: no site is started after that, the next run carries on); SEASON_DRY_RUN=1
// rates destinations without touching D1; SEASON_LIMIT caps the sites built.

import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { customSites, launchSites, siteSeasons, userFavoriteSites } from '../../src/db/schema';
import { ENGINE_VERSION, evaluateDays, launchProfileFromSite } from '../../src/lib/forecast-engine';
import { launchSiteToSite } from '../../src/lib/launch-sites';
import { customSiteToSite } from '../../src/lib/custom-sites';
import {
  bestMonths,
  encodeSeasonDays,
  seasonDayFromScore,
  seasonStats,
  statsMonths,
  statsSpread,
  type SeasonDay,
} from '../../src/lib/seasons';
import {
  ACCOUNT,
  TOKEN,
  SOARCAST_DB,
  d1,
  destinationJobs,
  jobFor,
  recordRange,
  seasonRange,
  timeZoneAt,
  ymd,
  type Job,
} from './lib';
import { era5Cell, era5Series, HOUR_MS, missing, type Era5Series } from './era5';
import { era5Profile } from './era5-profile';

const DRY_RUN = process.env.SEASON_DRY_RUN === '1';
const LIMIT = Number(process.env.SEASON_LIMIT || Infinity);
const MINUTES = Number(process.env.SEASON_MINUTES || 75);
const SOURCE = 'era5';

/** A site's season is rebuilt once its last month is this many months old. */
const REBUILD_AFTER_MONTHS = 2;

// Drizzle over D1's HTTP API, so the build reads rows the way the app does
const db = drizzle(
  async (sql, params, method) => {
    const { rows } = (await d1(SOARCAST_DB, 'raw', sql, params)) as { rows: unknown[][] };
    return { rows: method === 'get' ? (rows[0] as unknown[]) : rows };
  },
  { schema },
);

async function ownJobs(): Promise<Job[]> {
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

/** Every day of the range at a site, rated through the engine on ERA5, a local year at a time. */
function rateSite(job: Job, series: Era5Series, timeZone: string, from: string, to: string) {
  const { latitude: lat, longitude: lon } = job.site;
  const launch = launchProfileFromSite(job.site);
  const days: SeasonDay[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    const profile = era5Profile(series, year, timeZone, lat, lon);
    if (profile.hours.length === 0) continue;
    for (const score of evaluateDays(profile, launch)) {
      if (score.date >= from && score.date <= to) days.push(seasonDayFromScore(score));
    }
  }
  return days;
}

async function main() {
  if (!ACCOUNT || !TOKEN)
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are needed');
  const started = Date.now();
  const range = recordRange();
  const recent = seasonRange();
  console.log(
    `Season ${range.from} to ${range.to} from ERA5 (days kept one by one from ${recent.from}), ${MINUTES} minutes${DRY_RUN ? ', dry run' : ''}`,
  );

  // Built rows, by key: their last day, engine and source, to skip the up-to-date ones
  const built = new Map<string, { toDate: string; engineVersion: number; source: string | null }>();
  if (!DRY_RUN) {
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

  // In a dry run only the public destinations are rated
  const jobs = [...(DRY_RUN ? [] : await ownJobs()), ...(await destinationJobs())];
  const due = jobs.filter((j) => {
    const row = built.get(j.key);
    return (
      !row ||
      row.source !== SOURCE ||
      row.toDate < staleBefore ||
      row.engineVersion < ENGINE_VERSION
    );
  });
  // Launches in one ERA5 cell next to each other, so they share a read
  const cellOf = (j: Job) => era5Cell(j.site.latitude, j.site.longitude).key;
  due.sort((a, b) => (cellOf(a) < cellOf(b) ? -1 : cellOf(a) > cellOf(b) ? 1 : 0));
  console.log(`${jobs.length} sites, ${due.length} due`);

  // ERA5 hours from the first local day to the last, with half a day either side
  const fromMs = Date.parse(`${range.from}T00:00:00Z`) - 14 * HOUR_MS;
  const toMs = Date.parse(`${range.to}T23:00:00Z`) + 14 * HOUR_MS;
  let series = null as { cell: string; data: Era5Series } | null;
  let done = 0;
  for (const [i, job] of due.entries()) {
    if (done >= LIMIT || Date.now() - started > MINUTES * 60_000) {
      console.log(`Stopping with ${due.length - i} sites left for the next run`);
      break;
    }
    const tag = job.destination ? job.label : `${job.label} ${job.key.split('|')[1]}`;
    try {
      const t0 = Date.now();
      const cell = cellOf(job);
      if (series?.cell !== cell) {
        series = {
          cell,
          data: await era5Series(job.site.latitude, job.site.longitude, fromMs, toMs),
        };
      }
      const timeZone = await timeZoneAt(job.site.latitude, job.site.longitude);
      const read = Date.now() - t0;
      const days = rateSite(job, series.data, timeZone, range.from, range.to);
      const expected = (Date.parse(range.to) - Date.parse(range.from)) / 864e5 + 1;
      const stats = seasonStats(days);
      const goal = job.site.goal ?? 'soar';
      const months = statsMonths(stats, goal);
      const spread = statsSpread(stats, goal);
      console.log(
        `${tag}: ${days.length} of ${expected} days rated (read ${(read / 1000).toFixed(0)} s, rated ${((Date.now() - t0 - read) / 1000).toFixed(0)} s); ` +
          `go for its goal (${goal}) by month: ${months.map((m) => Math.round(m.goShare * 100)).join(' ')}; ` +
          `best ${bestMonths(months)?.text ?? 'none'}; go days in most years: ${spread.map((s) => (s ? `${s.low}-${s.high}` : '?')).join(' ')}`,
      );
      // A record with big holes would read as a season it isn't
      if (days.length < expected * 0.8) {
        console.log(`  skipped: too few days rated`);
        continue;
      }
      if (!DRY_RUN) {
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
        await db
          .insert(siteSeasons)
          .values(row)
          .onConflictDoUpdate({ target: siteSeasons.key, set: row });
      }
      done++;
    } catch (error) {
      console.log(`${tag}: failed, ${error instanceof Error ? error.message : error}`);
    }
  }
  if (missing.size > 0) console.log(`ERA5 files missing from the bucket: ${[...missing].join(', ')}`);
  console.log(`Built ${done} sites in ${((Date.now() - started) / 60_000).toFixed(0)} minutes`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
