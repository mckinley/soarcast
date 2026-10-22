// NOGA's map of cross-country takeoffs (https://noga.es/paragliding/map/):
// where XContest flights of 100 points or more started from 2015 to 2025,
// grouped into takeoffs, sites and regions, with flights by month. Counts
// only, never a pilot. The jobs Worker copies the takeoffs into
// noga_takeoffs once a week (jobs/noga-sync.ts); pages add them up into a
// site or region here. It never changes a verdict.

import { calculateDistance } from './site-utils';
import { monthsInWords } from './seasons';

export const NOGA_HOME = 'https://noga.es/paragliding/map/';
const DATA = `${NOGA_HOME}data/`;
export const NOGA_FILES = {
  takeoffs: `${DATA}takeoffs.geojson`,
  sites: `${DATA}sites.geojson`,
  regions: `${DATA}regions.geojson`,
} as const;

/** app_state key of the last copy (jobs/noga-sync.ts), read by /api/health. */
export const NOGA_SYNC_STATE_KEY = 'noga_sync_last_run';

export interface NogaSyncRun {
  instance: string;
  finishedAt: string;
  takeoffs: number;
  flights: number;
}

/** The smallest flight NOGA counts, in XContest points (about 100 km). */
export const NOGA_MIN_POINTS = 100;
/** A launch is on NOGA's map when one of its takeoffs is this close. */
export const NOGA_NEAR_KM = 3;

export type NogaKind = 'takeoff' | 'site' | 'region';

/** NOGA's own page for a takeoff, site or region. */
export function nogaPage(id: string): string {
  const kind = /^pg-(takeoff|site|region)-/.exec(id)?.[1] ?? 'site';
  return `${NOGA_HOME}en/${kind}_${id}.html`;
}

/** A takeoff as SoarCast keeps it (noga_takeoffs). */
export interface NogaTakeoff {
  id: string;
  name: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  siteId: string;
  siteName: string;
  regionId: string;
  regionName: string;
  flights: number;
  years: number;
  /** 12 counts, January first */
  byMonth: number[];
  avgPoints: number | null;
  maxPoints: number | null;
}

interface Feature {
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}
interface FeatureCollection {
  features?: Feature[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Takeoffs from NOGA's three map files, each with its site and region. */
export function parseNoga(
  takeoffs: FeatureCollection,
  sites: FeatureCollection,
  regions: FeatureCollection,
): NogaTakeoff[] {
  const regionNames = new Map<string, string>();
  for (const f of regions.features ?? []) {
    const id = str(f.properties?.id);
    const name = str(f.properties?.name);
    if (id && name) regionNames.set(id, name);
  }
  const siteInfo = new Map<string, { name: string; regionId: string }>();
  for (const f of sites.features ?? []) {
    const id = str(f.properties?.id);
    const name = str(f.properties?.name);
    const regionId = str(f.properties?.region_id);
    if (id && name && regionId) siteInfo.set(id, { name, regionId });
  }
  const out: NogaTakeoff[] = [];
  for (const f of takeoffs.features ?? []) {
    const p = f.properties ?? {};
    const id = str(p.id);
    const name = str(p.name);
    const country = str(p.country);
    const siteId = str(p.site_id);
    const [lon, lat] = f.geometry?.coordinates ?? [];
    const flights = num(p.total_flights);
    const perYear = num(p.avg_flights_per_year);
    const byMonth = Array.isArray(p.flights_by_month) ? p.flights_by_month.map(num) : [];
    const site = siteId ? siteInfo.get(siteId) : undefined;
    if (
      !id ||
      !name ||
      !country ||
      !siteId ||
      !site ||
      num(lat) == null ||
      num(lon) == null ||
      flights == null ||
      byMonth.length !== 12 ||
      byMonth.some((n) => n == null)
    ) {
      continue;
    }
    out.push({
      id,
      name,
      countryCode: country.toLowerCase(),
      latitude: lat!,
      longitude: lon!,
      siteId,
      siteName: site.name,
      regionId: site.regionId,
      regionName: regionNames.get(site.regionId) ?? site.name,
      flights,
      // Flights a year is the total over the years counted
      years: perYear && perYear > 0 ? Math.max(1, Math.round(flights / perYear)) : 1,
      byMonth: byMonth as number[],
      avgPoints: num(p.avg_points),
      maxPoints: num(p.max_points),
    });
  }
  return out;
}

/** Flights from a group of NOGA takeoffs: a site, a region, or several regions. */
export interface NogaFlights {
  /** What the flights were from: a site or region name, or "2 regions" */
  name: string;
  /** NOGA's page for it; null for several */
  href: string | null;
  kind: Exclude<NogaKind, 'takeoff'>;
  flights: number;
  years: number;
  /** Flights a year in each month, January first */
  perYear: number[];
  maxPoints: number | null;
}

/** Adds up takeoffs; null when there are none. */
export function sumTakeoffs(
  takeoffs: NogaTakeoff[],
  name: string,
  href: string | null,
  kind: NogaFlights['kind'],
): NogaFlights | null {
  if (takeoffs.length === 0) return null;
  const years = Math.max(...takeoffs.map((t) => t.years));
  const byMonth = Array.from({ length: 12 }, (_, i) =>
    takeoffs.reduce((sum, t) => sum + t.byMonth[i], 0),
  );
  const points = takeoffs.flatMap((t) => (t.maxPoints == null ? [] : [t.maxPoints]));
  return {
    name,
    href,
    kind,
    flights: takeoffs.reduce((sum, t) => sum + t.flights, 0),
    years,
    perYear: byMonth.map((n) => n / years),
    maxPoints: points.length > 0 ? Math.max(...points) : null,
  };
}

/** The takeoff nearest a point within `maxKm`, or null. */
export function nearestTakeoff(
  takeoffs: NogaTakeoff[],
  latitude: number,
  longitude: number,
  maxKm = NOGA_NEAR_KM,
): NogaTakeoff | null {
  let best: NogaTakeoff | null = null;
  let bestKm = maxKm;
  // A degree of latitude is 111 km: most takeoffs are ruled out without the trig
  const dLat = maxKm / 111;
  for (const t of takeoffs) {
    if (Math.abs(t.latitude - latitude) > dLat) continue;
    const km = calculateDistance(latitude, longitude, t.latitude, t.longitude);
    if (km <= bestKm) {
      best = t;
      bestKm = km;
    }
  }
  return best;
}

/** The NOGA site a launch is part of: every takeoff of the site its nearest takeoff is in. */
export function siteFlights(
  takeoffs: NogaTakeoff[],
  latitude: number,
  longitude: number,
): NogaFlights | null {
  const near = nearestTakeoff(takeoffs, latitude, longitude);
  if (!near) return null;
  return sumTakeoffs(
    takeoffs.filter((t) => t.siteId === near.siteId),
    near.siteName,
    nogaPage(near.siteId),
    'site',
  );
}

/** The NOGA regions a set of launches is in, added up. */
export function regionFlights(
  takeoffs: NogaTakeoff[],
  launches: Array<{ latitude: number; longitude: number }>,
): NogaFlights | null {
  const regions = new Map<string, string>();
  for (const l of launches) {
    const near = nearestTakeoff(takeoffs, l.latitude, l.longitude);
    if (near) regions.set(near.regionId, near.regionName);
  }
  if (regions.size === 0) return null;
  const [[id, name]] = regions;
  return sumTakeoffs(
    takeoffs.filter((t) => regions.has(t.regionId)),
    regions.size === 1 ? name : `${regions.size} regions`,
    regions.size === 1 ? nogaPage(id) : null,
    'region',
  );
}

/**
 * The months that hold most flights, in words: the busiest months until
 * they hold three quarters of them. Null with too few flights to say.
 */
export function mainMonths(perYear: number[]): string | null {
  const total = perYear.reduce((s, n) => s + n, 0);
  if (total <= 0) return null;
  const order = perYear.map((n, i) => ({ n, m: i + 1 })).sort((a, b) => b.n - a.n);
  const months: number[] = [];
  let held = 0;
  for (const { n, m } of order) {
    if (held >= total * 0.75) break;
    months.push(m);
    held += n;
  }
  return monthsInWords(months.sort((a, b) => a - b));
}

/** "about 1,240", "about 4", "under 1": a count a year in words. */
export function aboutPerYear(n: number): string {
  if (n === 0) return 'none';
  if (n < 1) return 'under 1';
  return `about ${(n >= 20 ? Math.round(n / 5) * 5 : Math.round(n)).toLocaleString('en-US')}`;
}
