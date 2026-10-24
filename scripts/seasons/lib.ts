// What the flown-day check (flown-check.ts) needs on GitHub: Open-Meteo's
// archived forecasts and D1 over Cloudflare's HTTP API. What it shares with
// the season build lives in src/lib/season-build/core.ts.

import type { OpenMeteoProfileResponse } from '../../src/lib/weather-profile';
import { DESTINATIONS } from '../../src/lib/destinations';
import { measureTerrainAt } from '../../src/lib/site-terrain';
import {
  destinationJob,
  errorText,
  fetchRetrying,
  findDestinationSite,
  ymd,
  type DayRange,
  type Job,
  type PgRow,
} from '../../src/lib/season-build/core';

export {
  cleanProfile,
  errorText,
  fetchRetrying,
  jobFor,
  PG_COLUMNS,
  seasonRange,
  siteFromPgRow,
  ymd,
  type DayRange,
  type Job,
  type PgRow,
} from '../../src/lib/season-build/core';

export const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
export const TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? '';
export const SOARCAST_DB = 'e92d8ad3-7ca9-47aa-b26b-e2288ec3b963';
export const PGSITES_DB = 'b7a6fb40-1aa2-4824-b589-2243c38487fc';

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
export const VARIABLES = [
  ...SURFACE,
  ...LEVEL_VARS.flatMap((v) => LEVELS.map((l) => `${v}_${l}hPa`)),
];
const CHUNK_MONTHS = 6;

export function chunks({ from, to }: DayRange): DayRange[] {
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
export function callWeight(range: DayRange): number {
  return Math.max(VARIABLES.length / 10, 1) * Math.max(days(range) / 14, 1);
}

export async function d1(
  databaseId: string,
  path: 'query' | 'raw',
  sql: string,
  params: unknown[],
) {
  const res = await fetchRetrying(
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchChunk(
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
export function merge(parts: OpenMeteoProfileResponse[]): OpenMeteoProfileResponse {
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

export async function destinationJobs(): Promise<Job[]> {
  const query = (sql: string, params: unknown[]) =>
    d1(PGSITES_DB, 'query', sql, params) as Promise<PgRow[]>;
  const jobs: Job[] = [];
  for (const dest of DESTINATIONS) {
    const row = await findDestinationSite(query, dest);
    if (!row) {
      console.log(`destination ${dest.slug}: no listed launch found near it`);
      continue;
    }
    jobs.push(destinationJob(dest, await withTerrain(row)));
  }
  return jobs;
}

/** A launch pgsites hasn't measured the terrain of yet, measured here the same way. */
export async function withTerrain(row: PgRow): Promise<PgRow> {
  if (row.terrain_slope != null && row.terrain_relief != null) return row;
  try {
    const m = await measureTerrainAt(row.latitude, row.longitude);
    return { ...row, terrain_slope: m.slope, terrain_relief: m.relief };
  } catch (error) {
    console.log(`${row.name}: terrain lookup failed, ${errorText(error)}`);
    return row;
  }
}
