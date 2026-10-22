// What the season build (jobs/season-build.ts, a Cloudflare Workflow) and
// the flown-day check (scripts/seasons/flown-check.ts) share: date ranges,
// a site's time zone, the listed launch each destination stands for, and
// rating a site's past days through the forecast engine.

import { DEFAULT_MAX_WIND_KMH, evaluateDays, launchProfileFromSite } from '../forecast-engine';
import { defaultGoal, siteKindFromTags } from '../site-goals';
import { getIdealWindDirections, getOkWindDirections } from '../site-utils';
import type { Destination } from '../destinations';
import {
  launchProfileKey,
  seasonDayFromScore,
  SEASON_MONTHS,
  SEASON_YEARS,
  type SeasonDay,
} from '../seasons';
import type { Site } from '../../types';
import type { Era5Series } from './era5';
import { era5Profile } from './era5-profile';
import { fetchRetrying } from './fetch';

export { cleanProfile } from './era5-profile';
export { errorText, fetchRetrying } from './fetch';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** How the log names a site: destinations by name, your own sites by a short key only. */
export function jobTag(job: Job): string {
  return job.destination ? job.label : `${job.label} ${job.key.split('|')[1]}`;
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

/** Runs a read on pgsites' sites table: D1's HTTP API in scripts, a binding in a Worker. */
export type PgQuery = (sql: string, params: unknown[]) => Promise<PgRow[]>;

/** The listed launch a destination stands for: a name match near its point, nearest first. */
export async function findDestinationSite(
  query: PgQuery,
  dest: Destination,
): Promise<PgRow | null> {
  const dLat = 30 / 111;
  const dLng = dLat / Math.cos((dest.latitude * Math.PI) / 180);
  for (const pattern of dest.match) {
    const rows = await query(
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
    );
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

/** The job for a destination, at the listed launch it stands for. */
export function destinationJob(dest: Destination, row: PgRow): Job {
  return jobFor(`pg:${row.id}`, siteFromPgRow(row), {
    label: `destination ${dest.slug} (${row.name})`,
    name: row.name,
    countryCode: row.country_code.toLowerCase(),
    destination: dest.slug,
  });
}

/** Every day of the range at a site, rated through the engine on ERA5, a local month at a time. */
export function rateSite(
  job: Job,
  series: Era5Series,
  timeZone: string,
  { from, to }: DayRange,
): SeasonDay[] {
  const { latitude: lat, longitude: lon } = job.site;
  const launch = launchProfileFromSite(job.site);
  const days: SeasonDay[] = [];
  for (
    let month = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
    ymd(month) <= to;
    month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))
  ) {
    const first = ymd(month);
    const last = ymd(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)));
    const profile = era5Profile(
      series,
      first < from ? from : first,
      last > to ? to : last,
      timeZone,
      lat,
      lon,
    );
    if (profile.hours.length === 0) continue;
    for (const score of evaluateDays(profile, launch)) days.push(seasonDayFromScore(score));
  }
  return days;
}

/** Days in a range, both ends counted. */
export function daysIn({ from, to }: DayRange): number {
  return (Date.parse(to) - Date.parse(from)) / 864e5 + 1;
}
