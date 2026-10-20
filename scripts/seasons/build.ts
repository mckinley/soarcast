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
import {
  evaluateDays,
  launchProfileFromSite,
  DEFAULT_MAX_WIND_KMH,
} from '../../src/lib/forecast-engine';
import {
  profileFromOpenMeteo,
  type AtmosphericProfile,
  type OpenMeteoProfileResponse,
} from '../../src/lib/weather-profile';
import { launchSiteToSite } from '../../src/lib/launch-sites';
import { customSiteToSite } from '../../src/lib/custom-sites';
import { defaultGoal, siteKindFromTags } from '../../src/lib/site-goals';
import { getIdealWindDirections, getOkWindDirections } from '../../src/lib/site-utils';
import { DESTINATIONS, type Destination } from '../../src/lib/destinations';
import {
  bestMonths,
  encodeSeasonDays,
  launchProfileKey,
  seasonDayFromScore,
  seasonMonths,
} from '../../src/lib/seasons';
import type { Site } from '../../src/types';

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? '';
const SOARCAST_DB = 'e92d8ad3-7ca9-47aa-b26b-e2288ec3b963';
const PGSITES_DB = 'b7a6fb40-1aa2-4824-b589-2243c38487fc';
const BUDGET = Number(process.env.SEASON_CALL_BUDGET || 4500);
const DRY_RUN = process.env.SEASON_DRY_RUN === '1';
const LIMIT = Number(process.env.SEASON_LIMIT || Infinity);

const HISTORICAL_URL = 'https://historical-forecast-api.open-meteo.com/v1/forecast';
// What the engine reads, at 50 hPa steps: a quarter of the live request
const SURFACE = [
  'temperature_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'cape',
  'boundary_layer_height',
  'convective_inhibition',
  'lifted_index',
  'shortwave_radiation',
  'dew_point_2m',
  'precipitation',
  'cloud_cover_low',
  'visibility',
];
const LEVELS = [1000, 950, 900, 850, 800, 750, 700, 600];
const LEVEL_VARS = ['temperature', 'wind_speed', 'wind_direction', 'geopotential_height'];
const VARIABLES = [...SURFACE, ...LEVEL_VARS.flatMap((v) => LEVELS.map((l) => `${v}_${l}hPa`))];
const CHUNK_MONTHS = 6;
/** A site's season is rebuilt once its last month is this many months old. */
const REBUILD_AFTER_MONTHS = 2;

type DayRange = { from: string; to: string };

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The 24 whole months before this one. */
function seasonRange(now = new Date()): DayRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { from: ymd(new Date(Date.UTC(y, m - 24, 1))), to: ymd(new Date(Date.UTC(y, m, 0))) };
}

function chunks({ from, to }: DayRange): DayRange[] {
  const out: DayRange[] = [];
  let start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (start <= end) {
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + CHUNK_MONTHS, 1));
    const last = new Date(Math.min(next.getTime() - 864e5, end.getTime()));
    out.push({ from: ymd(start), to: ymd(last) });
    start = next;
  }
  return out;
}

function days({ from, to }: DayRange): number {
  return (Date.parse(to) - Date.parse(from)) / 864e5 + 1;
}

/** Open-Meteo's weight for a request: 10 variables and 2 weeks make one call. */
function callWeight(range: DayRange): number {
  return Math.max(VARIABLES.length / 10, 1) * Math.max(days(range) / 14, 1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function d1(databaseId: string, path: 'query' | 'raw', sql: string, params: unknown[]) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${databaseId}/${path}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = (await res.json()) as {
    success: boolean;
    errors: unknown[];
    result: Array<{ results: unknown }>;
  };
  if (!body.success) throw new Error(`D1 ${path}: ${JSON.stringify(body.errors).slice(0, 300)}`);
  return body.result[0].results;
}

// Drizzle over D1's HTTP API, so the build reads rows the way the app does
const db = drizzle(
  async (sql, params, method) => {
    const { rows } = (await d1(SOARCAST_DB, 'raw', sql, params)) as { rows: unknown[][] };
    return { rows: method === 'get' ? (rows[0] as unknown[]) : rows };
  },
  { schema },
);

async function fetchChunk(
  lat: number,
  lng: number,
  range: DayRange,
): Promise<OpenMeteoProfileResponse> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: VARIABLES.join(','),
    daily: 'sunrise,sunset',
    start_date: range.from,
    end_date: range.to,
    timezone: 'auto',
    elevation: 'nan',
  });
  const url = `${HISTORICAL_URL}?${params}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as OpenMeteoProfileResponse;
    const reason = (await res.text()).slice(0, 200);
    // Per-minute limit: wait it out; anything else retries once
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      console.log(`  Open-Meteo ${res.status}, waiting: ${reason}`);
      await sleep(res.status === 429 ? 65_000 : 10_000);
      continue;
    }
    throw new Error(`Open-Meteo ${res.status}: ${reason}`);
  }
}

/** Joins chunked responses into one response. */
function merge(parts: OpenMeteoProfileResponse[]): OpenMeteoProfileResponse {
  const [first] = parts;
  const hourly: Record<string, unknown[]> = {};
  for (const key of Object.keys(first.hourly)) {
    hourly[key] = parts.flatMap(
      (p) => (p.hourly as unknown as Record<string, unknown[]>)[key] ?? [],
    );
  }
  const daily = first.daily && {
    time: parts.flatMap((p) => p.daily?.time ?? []),
    sunrise: parts.flatMap((p) => p.daily?.sunrise ?? []),
    sunset: parts.flatMap((p) => p.daily?.sunset ?? []),
  };
  return { ...first, hourly: hourly as unknown as OpenMeteoProfileResponse['hourly'], daily };
}

/** Hours missing what the engine can't do without are dropped, then days left short. */
function cleanProfile(profile: AtmosphericProfile): AtmosphericProfile {
  const complete = profile.hours.filter(
    (h) =>
      h.surface.temperature != null &&
      h.surface.windSpeed != null &&
      h.surface.windDirection != null &&
      h.surface.windGusts != null &&
      h.pressureLevels.every((l) => l.geopotentialHeight != null && l.windSpeed != null),
  );
  const perDay = new Map<string, number>();
  for (const h of complete)
    perDay.set(h.time.slice(0, 10), (perDay.get(h.time.slice(0, 10)) ?? 0) + 1);
  return {
    ...profile,
    hours: complete.filter((h) => (perDay.get(h.time.slice(0, 10)) ?? 0) >= 20),
  };
}

interface Job {
  key: string;
  siteRef: string;
  site: Site;
  /** What the log may say about the site */
  label: string;
  name: string | null;
  countryCode: string | null;
  destination: string | null;
}

function jobFor(
  siteRef: string,
  site: Site,
  extra: Pick<Job, 'label' | 'name' | 'countryCode' | 'destination'>,
): Job {
  return {
    key: `${siteRef}|${launchProfileKey(launchProfileFromSite(site))}`,
    siteRef,
    site,
    ...extra,
  };
}

type PgRow = {
  id: string;
  name: string;
  country_code: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  wind_n: number;
  wind_ne: number;
  wind_e: number;
  wind_se: number;
  wind_s: number;
  wind_sw: number;
  wind_w: number;
  wind_nw: number;
  is_thermal: number;
  is_soaring: number;
  is_xc: number;
  is_hike: number;
};

/** The listed launch a destination stands for: a name match near its point, nearest first. */
async function findDestinationSite(dest: Destination): Promise<PgRow | null> {
  const dLat = 30 / 111;
  const dLng = dLat / Math.cos((dest.latitude * Math.PI) / 180);
  for (const pattern of dest.match) {
    const rows = (await d1(
      PGSITES_DB,
      'query',
      `SELECT id, name, country_code, latitude, longitude, altitude,
              wind_n, wind_ne, wind_e, wind_se, wind_s, wind_sw, wind_w, wind_nw,
              is_thermal, is_soaring, is_xc, is_hike
       FROM sites
       WHERE pge_deleted_at IS NULL AND country_code = ? AND name LIKE ?
         AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`,
      [
        dest.countryCode,
        pattern,
        dest.latitude - dLat,
        dest.latitude + dLat,
        dest.longitude - dLng,
        dest.longitude + dLng,
      ],
    )) as PgRow[];
    // Prefer a launch that has its wind directions rated
    const rated = (r: PgRow) =>
      [r.wind_n, r.wind_ne, r.wind_e, r.wind_se, r.wind_s, r.wind_sw, r.wind_w, r.wind_nw].some(
        (w) => w > 0,
      );
    const dist = (r: PgRow) =>
      Math.hypot(
        r.latitude - dest.latitude,
        (r.longitude - dest.longitude) * Math.cos((dest.latitude * Math.PI) / 180),
      );
    rows.sort((a, b) => Number(rated(b)) - Number(rated(a)) || dist(a) - dist(b));
    if (rows.length > 0) return rows[0];
  }
  return null;
}

function siteFromPgRow(row: PgRow): Site {
  const wind = {
    windN: row.wind_n,
    windNe: row.wind_ne,
    windE: row.wind_e,
    windSe: row.wind_se,
    windS: row.wind_s,
    windSw: row.wind_sw,
    windW: row.wind_w,
    windNw: row.wind_nw,
  };
  const kind = siteKindFromTags({
    thermal: row.is_thermal,
    soaring: row.is_soaring,
    xc: row.is_xc,
  });
  const now = new Date().toISOString();
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    elevation: row.altitude || 0,
    idealWindDirections: getIdealWindDirections(wind),
    okWindDirections: getOkWindDirections(wind),
    maxWindSpeed: DEFAULT_MAX_WIND_KMH,
    kind,
    goal: defaultGoal(kind, !!row.is_hike),
    createdAt: now,
    updatedAt: now,
  };
}

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
        countryCode: f.site.countryCode,
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

async function destinationJobs(): Promise<Job[]> {
  const jobs: Job[] = [];
  for (const dest of DESTINATIONS) {
    const row = await findDestinationSite(dest);
    if (!row) {
      console.log(`destination ${dest.slug}: no listed launch found near it`);
      continue;
    }
    jobs.push(
      jobFor(`pg:${row.id}`, siteFromPgRow(row), {
        label: `destination ${dest.slug} (${row.name})`,
        name: row.name,
        countryCode: row.country_code,
        destination: dest.slug,
      }),
    );
  }
  return jobs;
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
