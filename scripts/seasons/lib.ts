// What the season build (build.ts) and the flown-day check (flown-check.ts)
// share: Open-Meteo's archived forecasts, D1 over Cloudflare's HTTP API,
// and the listed launch each destination stands for.

import { launchProfileFromSite, DEFAULT_MAX_WIND_KMH } from '../../src/lib/forecast-engine';
import type { AtmosphericProfile, OpenMeteoProfileResponse } from '../../src/lib/weather-profile';
import { defaultGoal, siteKindFromTags } from '../../src/lib/site-goals';
import { getIdealWindDirections, getOkWindDirections } from '../../src/lib/site-utils';
import { DESTINATIONS, type Destination } from '../../src/lib/destinations';
import { launchProfileKey, SEASON_MONTHS, SEASON_YEARS } from '../../src/lib/seasons';
import type { Site } from '../../src/types';

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

export type DayRange = { from: string; to: string };

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The SEASON_MONTHS whole months before this one: the days kept one by one. */
export function seasonRange(now = new Date(), months = SEASON_MONTHS): DayRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    from: ymd(new Date(Date.UTC(y, m - months, 1))),
    to: ymd(new Date(Date.UTC(y, m, 0))),
  };
}

/** The SEASON_YEARS of whole months before this one: the span a season is rated over. */
export function recordRange(now = new Date()): DayRange {
  return seasonRange(now, SEASON_YEARS * 12);
}

const timeZones = new Map<string, string>();

/** A place's time zone, from Open-Meteo's forecast API (one small call). */
export async function timeZoneAt(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const known = timeZones.get(key);
  if (known) return known;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: 'sunrise',
    forecast_days: '1',
    timezone: 'auto',
  });
  for (let attempt = 0; ; attempt++) {
    const res = await fetchRetrying(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (res.ok) {
      const { timezone } = (await res.json()) as { timezone: string };
      timeZones.set(key, timezone);
      return timezone;
    }
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      await sleep(res.status === 429 ? 65_000 : 10_000);
      continue;
    }
    throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch, tried again a few times when the connection fails (not on an HTTP error). */
export async function fetchRetrying(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (attempt >= 3) throw error;
      await sleep(3000 * 2 ** attempt);
    }
  }
}

/** An error in a line, with the network cause fetch hides behind "fetch failed". */
export function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  return cause ? `${error.message} (${cause.code ?? cause.message})` : error.message;
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

/** Hours missing what the engine can't do without are dropped, then days left short. */
export function cleanProfile(profile: AtmosphericProfile): AtmosphericProfile {
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

export interface Job {
  key: string;
  siteRef: string;
  site: Site;
  /** What the log may say about the site */
  label: string;
  name: string | null;
  countryCode: string | null;
  destination: string | null;
}

export function jobFor(
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

export type PgRow = {
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

export const PG_COLUMNS = `id, name, country_code, latitude, longitude, altitude,
  wind_n, wind_ne, wind_e, wind_se, wind_s, wind_sw, wind_w, wind_nw,
  is_thermal, is_soaring, is_xc, is_hike`;

/** The listed launch a destination stands for: a name match near its point, nearest first. */
async function findDestinationSite(dest: Destination): Promise<PgRow | null> {
  const dLat = 30 / 111;
  const dLng = dLat / Math.cos((dest.latitude * Math.PI) / 180);
  for (const pattern of dest.match) {
    const rows = (await d1(
      PGSITES_DB,
      'query',
      `SELECT ${PG_COLUMNS}
       FROM sites
       WHERE pge_deleted_at IS NULL AND country_code = ? AND name LIKE ?
         AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`,
      [
        dest.countryCode.toUpperCase(), // sites.country_code is uppercase
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

export function siteFromPgRow(row: PgRow): Site {
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

export async function destinationJobs(): Promise<Job[]> {
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
        countryCode: row.country_code.toLowerCase(),
        destination: dest.slug,
      }),
    );
  }
  return jobs;
}
