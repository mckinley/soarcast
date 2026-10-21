// Season build: rates every day of the last two years at each site, the
// same way today's forecast is rated, from Open-Meteo's archived forecasts,
// and writes the days to site_seasons in the soarcast D1 for site pages and
// the Year page. Sites: every followed and custom site, then the
// destinations in src/lib/destinations.ts.
//
// Runs in the "Season build" workflow: Open-Meteo rate-limits Claude's
// sandbox, and the free API allows 10,000 calls a day (a call here weighs
// variables / 10 x days / 14, about 240 a site). The repo is public, so the
// log names listed destinations only; your own sites show as a short key.
//
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID; SEASON_CALL_BUDGET
// (default 4500, under the 5,000-an-hour limit); SEASON_DRY_RUN=1 rates
// destinations without touching D1's site_seasons (before its migration);
// SEASON_LIMIT caps the sites built.

import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { customSites, launchSites, siteSeasons, userFavoriteSites } from '../../src/db/schema';
import { evaluateDays, launchProfileFromSite } from '../../src/lib/forecast-engine';
import { profileFromOpenMeteo, type OpenMeteoProfileResponse } from '../../src/lib/weather-profile';
import { launchSiteToSite } from '../../src/lib/launch-sites';
import { customSiteToSite } from '../../src/lib/custom-sites';
import {
  bestMonths,
  encodeSeasonDays,
  seasonDayFromScore,
  seasonMonths,
} from '../../src/lib/seasons';
import {
  ACCOUNT,
  TOKEN,
  SOARCAST_DB,
  VARIABLES,
  callWeight,
  chunks,
  cleanProfile,
  d1,
  destinationJobs,
  fetchChunk,
  jobFor,
  merge,
  seasonRange,
  ymd,
  type Job,
} from './lib';

const BUDGET = Number(process.env.SEASON_CALL_BUDGET || 4500);
const DRY_RUN = process.env.SEASON_DRY_RUN === '1';
const LIMIT = Number(process.env.SEASON_LIMIT || Infinity);

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

async function main() {
  if (!ACCOUNT || !TOKEN)
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are needed');
  const range = seasonRange();
  const parts = chunks(range);
  const cost = parts.reduce((s, p) => s + callWeight(p), 0);
  console.log(
    `Season ${range.from} to ${range.to}: ${VARIABLES.length} variables, ~${cost.toFixed(0)} calls a site, budget ${BUDGET}${DRY_RUN ? ', dry run' : ''}`,
  );

  // Built rows, by key: their last day, to skip the up-to-date ones
  const built = new Map<string, string>();
  if (!DRY_RUN) {
    for (const r of await db
      .select({ key: siteSeasons.key, toDate: siteSeasons.toDate })
      .from(siteSeasons)) {
      built.set(r.key, r.toDate);
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

  // In a dry run (no site_seasons yet) only the public destinations are rated
  const jobs = [...(DRY_RUN ? [] : await ownJobs()), ...(await destinationJobs())];
  const due = jobs.filter((j) => !built.has(j.key) || built.get(j.key)! < staleBefore);
  console.log(`${jobs.length} sites, ${due.length} due`);

  let spent = 0;
  let done = 0;
  for (const [i, job] of due.entries()) {
    if (done >= LIMIT || spent + cost > BUDGET) {
      console.log(
        `Stopping with ${due.length - i} sites left for the next run (${spent.toFixed(0)} calls spent)`,
      );
      break;
    }
    const tag = job.destination ? job.label : `${job.label} ${job.key.split('|')[1]}`;
    try {
      const responses: OpenMeteoProfileResponse[] = [];
      for (const part of parts) {
        responses.push(await fetchChunk(job.site.latitude, job.site.longitude, part));
        spent += callWeight(part);
      }
      const raw = profileFromOpenMeteo(merge(responses));
      const profile = cleanProfile(raw);
      const blh =
        profile.hours.filter((h) => h.surface.boundaryLayerHeight != null).length /
        Math.max(1, profile.hours.length);
      const scores = evaluateDays(profile, launchProfileFromSite(job.site));
      const seasonDays = scores.map(seasonDayFromScore);
      const months = seasonMonths(seasonDays, job.site.goal ?? 'soar');
      const best = bestMonths(months);
      console.log(
        `${tag}: ${seasonDays.length} days (${raw.hours.length - profile.hours.length} hours dropped), boundary layer on ${(blh * 100).toFixed(0)}% of hours; ` +
          `go for its goal (${job.site.goal}) by month: ${months.map((m) => Math.round(m.goShare * 100)).join(' ')}; best ${best?.text ?? 'none'}`,
      );
      // Without the boundary layer the engine sees no thermals: better no season than a wrong one
      if (blh < 0.7) {
        console.log(`  skipped: too little boundary-layer data to rate thermals`);
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
          days: encodeSeasonDays(seasonDays),
          fromDate: seasonDays[0]?.date ?? range.from,
          toDate: seasonDays[seasonDays.length - 1]?.date ?? range.to,
          builtAt: new Date(),
        };
        await db
          .insert(siteSeasons)
          .values(row)
          .onConflictDoUpdate({ target: siteSeasons.key, set: row });
      }
      done++;
    } catch (error) {
      console.log(`${tag}: failed, ${error instanceof Error ? error.message : error}`);
      if (String(error).includes('Open-Meteo 429')) break;
    }
  }
  console.log(`Built ${done} sites, ~${spent.toFixed(0)} calls`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
