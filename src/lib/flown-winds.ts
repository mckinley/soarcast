// Wind on flown days, an experiment (Settings, "Show experiments"): which
// wind directions pilots really flew a launch in. The season build keeps the
// wind at the launch for each hour of the day over the last SEASON_MONTHS
// months (site_seasons.winds, from ERA5); a site page sets it against the
// days pilots flew there (src/lib/flown-days.ts). It never changes a verdict.

import type { FlownDay } from './flown-days';

/** The local hours the season build keeps the launch wind for. */
export const WIND_FIRST_HOUR = 9;
export const WIND_LAST_HOUR = 18;
/** Below this the wind has no real direction (km/h). */
export const CALM_KMH = 5;
/** Fewer flown days than this say too little about the wind. */
export const MIN_WIND_FLOWN_DAYS = 10;
/** The hour used when no flight says when pilots launch. */
const DEFAULT_HOUR = 13;

/** The wind at the launch: km/h, and the direction it comes from in degrees. */
export interface HourWind {
  speed: number;
  direction: number;
}

/** One local day: the wind each hour from WIND_FIRST_HOUR to WIND_LAST_HOUR (null where unknown). */
export interface DayWinds {
  date: string;
  hours: Array<HourWind | null>;
}

const HOURS = WIND_LAST_HOUR - WIND_FIRST_HOUR + 1;

/**
 * "20250714" then two characters an hour, comma-separated days: the
 * direction in tens of degrees and the speed in steps of 2 km/h (up to 70),
 * each one base-36 digit, or "--" for an hour with no wind known.
 */
export function encodeDayWinds(days: DayWinds[]): string {
  return days
    .map((d) => {
      const hours = d.hours
        .map((w) =>
          w
            ? `${(Math.round(w.direction / 10) % 36).toString(36)}${Math.min(35, Math.round(w.speed / 2)).toString(36)}`
            : '--',
        )
        .join('');
      return `${d.date.replace(/-/g, '')}${hours}`;
    })
    .join(',');
}

export function decodeDayWinds(encoded: string | null | undefined): DayWinds[] {
  if (!encoded) return [];
  return encoded.split(',').map((s) => {
    const hours: Array<HourWind | null> = [];
    for (let i = 0; i < HOURS; i++) {
      const pair = s.slice(8 + i * 2, 10 + i * 2);
      hours.push(
        pair.length === 2 && pair !== '--'
          ? { direction: parseInt(pair[0], 36) * 10, speed: parseInt(pair[1], 36) * 2 }
          : null,
      );
    }
    return { date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, hours };
  });
}

/** The hour most flights here started: the middle first takeoff, within the hours kept. */
export function usualLaunchHour(flown: FlownDay[]): number {
  const hours = flown
    .flatMap((d) => (d.firstTakeoff ? [Number(d.firstTakeoff.slice(0, 2))] : []))
    .sort((a, b) => a - b);
  const middle = hours.length ? hours[Math.floor(hours.length / 2)] : DEFAULT_HOUR;
  return Math.min(WIND_LAST_HOUR, Math.max(WIND_FIRST_HOUR, middle));
}

export const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** The eight compass points, each with its days and the days pilots flew. */
export interface WindSector {
  direction: (typeof DIRECTIONS)[number];
  days: number;
  flown: number;
  /** What the site's listing says of wind from here */
  listed: 'ideal' | 'ok' | null;
}

export interface FlownWinds {
  /** The local hour the wind is read at */
  hour: number;
  fromDate: string;
  toDate: string;
  days: number;
  flownDays: number;
  calm: { days: number; flown: number };
  sectors: WindSector[];
}

/**
 * What a site page shows of the experiment: the winds, or why there are
 * none: the season build hasn't kept the wind here, too few flown days, or
 * a read failed.
 */
export type WindsExperiment =
  | { winds: FlownWinds; why: null }
  | { winds: null; why: 'no-winds' | 'few-flown' | 'failed' };

function sectorOf(degrees: number): number {
  return Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
}

/**
 * The days with wind from each direction at the hour pilots usually launch,
 * and how many of them someone flew. Null with too few flown days.
 */
export function flownWinds(
  winds: DayWinds[],
  flown: FlownDay[],
  listed: { ideal: number[]; ok: number[] },
): FlownWinds | null {
  if (winds.length === 0) return null;
  const fromDate = winds[0].date;
  const toDate = winds[winds.length - 1].date;
  const inSpan = flown.filter((d) => d.date >= fromDate && d.date <= toDate);
  if (inSpan.length < MIN_WIND_FLOWN_DAYS) return null;
  const hour = usualLaunchHour(inSpan);
  const flownDates = new Set(inSpan.map((d) => d.date));

  const listedAt = new Map<number, 'ideal' | 'ok'>();
  for (const d of listed.ok) listedAt.set(sectorOf(d), 'ok');
  for (const d of listed.ideal) listedAt.set(sectorOf(d), 'ideal');
  const sectors: WindSector[] = DIRECTIONS.map((direction, i) => ({
    direction,
    days: 0,
    flown: 0,
    listed: listedAt.get(i) ?? null,
  }));
  const calm = { days: 0, flown: 0 };
  let days = 0;
  let flownDays = 0;
  for (const day of winds) {
    const wind = day.hours[hour - WIND_FIRST_HOUR];
    if (!wind) continue;
    const wasFlown = flownDates.has(day.date);
    const bucket = wind.speed < CALM_KMH ? calm : sectors[sectorOf(wind.direction)];
    bucket.days++;
    days++;
    if (wasFlown) {
      bucket.flown++;
      flownDays++;
    }
  }
  if (flownDays < MIN_WIND_FLOWN_DAYS) return null;
  return { hour, fromDate, toDate, days, flownDays, calm, sectors };
}

/** Directions in words: "W", "W and NW", "SW, W and NW". */
export function directionsInWords(directions: string[]): string {
  if (directions.length <= 1) return directions.join('');
  return `${directions.slice(0, -1).join(', ')} and ${directions[directions.length - 1]}`;
}

/** The directions that held most flown days: the busiest until they hold three quarters. */
export function mainFlownDirections(w: FlownWinds): string[] {
  const order = [...w.sectors].filter((s) => s.flown > 0).sort((a, b) => b.flown - a.flown);
  const windy = w.sectors.reduce((sum, s) => sum + s.flown, 0);
  const out: string[] = [];
  let held = 0;
  for (const s of order) {
    if (held >= windy * 0.75) break;
    out.push(s.direction);
    held += s.flown;
  }
  // In compass order
  return DIRECTIONS.filter((d) => out.includes(d));
}

/** Flown days with wind from a direction the listing doesn't name, and those directions. */
export function flownOffListing(w: FlownWinds): { days: number; directions: string[] } | null {
  if (!w.sectors.some((s) => s.listed)) return null;
  const off = w.sectors.filter((s) => !s.listed && s.flown > 0);
  return {
    days: off.reduce((sum, s) => sum + s.flown, 0),
    directions: off.map((s) => s.direction),
  };
}
