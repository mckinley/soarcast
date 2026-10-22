// Wind now at weather stations near a launch, from winds.mobi, which
// gathers airport reports (METAR) and the wind stations pilots put at
// launches and landings (OpenWindMap, FFVL, MeteoSwiss and others). Site
// pages list the nearest (app/lib/wind-now.server.ts, src/components/wind-now.tsx)
// and the map's Wind now layer draws them (src/components/map-layers.tsx).
// Wind now never changes a verdict.

import { COMPASS_POINTS, calculateDistance } from './site-utils';

export const WINDS_MOBI_API = 'https://winds.mobi/api/2.3/stations/';

/** Stations this far (km) from a launch are listed on its page. */
export const WIND_NOW_RADIUS_KM = 50;
/** At most this many stations on a site page. */
export const WIND_NOW_STATIONS = 4;
/** A reading older than this (minutes) is left out. */
export const WIND_NOW_MAX_AGE_MINUTES = 90;
/** A station this close (m) to the launch's height counts as at launch height. */
export const LAUNCH_HEIGHT_M = 150;

/** Holfuy allows its readings only in its own widgets, so its stations are left out. */
const EXCLUDED_PROVIDERS = new Set(['holfuy']);

/** The fields SoarCast asks winds.mobi for. */
export const WINDS_MOBI_KEYS = [
  'short',
  'name',
  'alt',
  'loc',
  'pv-code',
  'pv-name',
  'url',
  'last._id',
  'last.w-dir',
  'last.w-avg',
  'last.w-max',
] as const;

/** A station as winds.mobi answers it (only the keys asked for). */
export interface WindsMobiStation {
  _id: string;
  short?: string;
  name?: string;
  alt?: number;
  loc?: { coordinates?: [number, number] };
  'pv-code'?: string;
  'pv-name'?: string;
  url?: Record<string, string>;
  last?: { _id?: number; 'w-dir'?: number; 'w-avg'?: number; 'w-max'?: number };
}

export interface WindStation {
  id: string;
  name: string;
  /** Who runs it, as winds.mobi names them (aviationweather.gov, openwindmap.org) */
  provider: string;
  url: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  /** When the reading was taken, unix seconds */
  at: number;
  /** Where the wind blows from, degrees */
  direction: number;
  /** Average wind and strongest gust, km/h */
  speed: number;
  gust: number | null;
}

/** A winds.mobi station as SoarCast shows it, or null when it has no usable reading. */
export function toWindStation(s: WindsMobiStation): WindStation | null {
  const [longitude, latitude] = s.loc?.coordinates ?? [];
  const last = s.last;
  if (
    EXCLUDED_PROVIDERS.has(s['pv-code'] ?? '') ||
    latitude == null ||
    longitude == null ||
    last?._id == null ||
    last['w-dir'] == null ||
    last['w-avg'] == null
  ) {
    return null;
  }
  return {
    id: s._id,
    name: s.short || s.name || s._id,
    provider: s['pv-name'] ?? s['pv-code'] ?? 'winds.mobi',
    url: s.url?.default ?? Object.values(s.url ?? {})[0] ?? null,
    latitude,
    longitude,
    altitude: typeof s.alt === 'number' ? s.alt : null,
    at: last._id,
    direction: ((last['w-dir'] % 360) + 360) % 360,
    speed: last['w-avg'],
    gust: last['w-max'] != null && last['w-max'] >= last['w-avg'] ? last['w-max'] : null,
  };
}

/** Fresh stations from a winds.mobi answer. */
export function freshStations(answer: unknown, nowSec: number): WindStation[] {
  if (!Array.isArray(answer)) return [];
  const oldest = nowSec - WIND_NOW_MAX_AGE_MINUTES * 60;
  return answer
    .map((s) => toWindStation(s as WindsMobiStation))
    .filter((s): s is WindStation => s != null && s.at >= oldest && s.at <= nowSec + 600);
}

export interface NearStation extends WindStation {
  distanceKm: number;
}

/** The nearest fresh stations to a launch, nearest first. */
export function nearestStations(
  stations: WindStation[],
  latitude: number,
  longitude: number,
): NearStation[] {
  return stations
    .map((s) => ({
      ...s,
      distanceKm: calculateDistance(latitude, longitude, s.latitude, s.longitude),
    }))
    .filter((s) => s.distanceKm <= WIND_NOW_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, WIND_NOW_STATIONS);
}

/** The winds.mobi query for stations near a place. */
export function nearQuery(latitude: number, longitude: number): string {
  const p = new URLSearchParams({
    'near-lat': latitude.toFixed(3),
    'near-lon': longitude.toFixed(3),
    'near-distance': String(WIND_NOW_RADIUS_KM * 1000),
    limit: '12',
    'last-measure': String(WIND_NOW_MAX_AGE_MINUTES * 60),
  });
  for (const k of WINDS_MOBI_KEYS) p.append('keys', k);
  return `${WINDS_MOBI_API}?${p}`;
}

/**
 * The winds.mobi query for stations inside a map's view. The first corner is
 * the south-west one: with the north-west one first, winds.mobi answers
 * stations from anywhere in the world. Longitudes past the date line are cut
 * back to it, as winds.mobi refuses them.
 */
export function withinQuery(south: number, west: number, north: number, east: number): string {
  const clamp = (x: number, limit: number) => Math.max(-limit, Math.min(limit, x));
  const p = new URLSearchParams({
    'within-pt1-lat': clamp(south, 90).toFixed(3),
    'within-pt1-lon': clamp(west, 180).toFixed(3),
    'within-pt2-lat': clamp(north, 90).toFixed(3),
    'within-pt2-lon': clamp(east, 180).toFixed(3),
    limit: '200',
    'last-measure': String(WIND_NOW_MAX_AGE_MINUTES * 60),
    'is-highest-duplicates-rating': 'true',
  });
  for (const k of WINDS_MOBI_KEYS) p.append('keys', k);
  return `${WINDS_MOBI_API}?${p}`;
}

/** "NW": the nearest of the eight compass points. */
export function compassPoint(degrees: number): string {
  return COMPASS_POINTS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8].label;
}

/** Where a station sits against the launch's height, in words. */
export function heightText(
  stationAltitude: number | null,
  launchAltitude: number | null,
): string | null {
  if (stationAltitude == null || !launchAltitude) return null;
  const diff = Math.round((stationAltitude - launchAltitude) / 10) * 10;
  if (Math.abs(diff) <= LAUNCH_HEIGHT_M) return 'at launch height';
  return diff > 0 ? `${diff} m above launch` : `${-diff} m below launch`;
}

/** "NW 12 km/h, gusts 20": a reading in words. */
export function readingText(s: Pick<WindStation, 'direction' | 'speed' | 'gust'>): string {
  const speed = Math.round(s.speed);
  if (speed === 0 && !s.gust) return 'Calm';
  const gust = s.gust != null ? Math.round(s.gust) : null;
  return gust != null && gust > speed
    ? `${compassPoint(s.direction)} ${speed} km/h, gusts ${gust}`
    : `${compassPoint(s.direction)} ${speed} km/h`;
}

/** An arrow with a shaft, pointing up in a 24 by 24 box: turned to show the way the wind blows. */
export const WIND_ARROW_PATH = 'M12 1 L19.5 10 H14.5 V23 H9.5 V10 H4.5 Z';

/** Wind speeds (km/h) where the map's arrows turn from green to amber, and amber to red. */
export const WIND_COLOR_KMH = { amber: 15, red: 25 } as const;

/** The colour of a station's arrow on the map, by its stronger of average and gust. */
export function windColor(s: Pick<WindStation, 'speed' | 'gust'>): 'green' | 'amber' | 'red' {
  const strongest = Math.max(s.speed, s.gust ?? 0);
  if (strongest >= WIND_COLOR_KMH.red) return 'red';
  if (strongest >= WIND_COLOR_KMH.amber) return 'amber';
  return 'green';
}
