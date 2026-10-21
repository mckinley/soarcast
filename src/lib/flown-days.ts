// Days pilots really flew from a launch, from Syncing Pilots (live inReach
// and SPOT trackers; app/lib/flown-days.server.ts fetches them), and how
// SoarCast's ratings of those days compare. Flown days never change a
// verdict: they show how the forecast has done.

import type { SiteGoal } from '@/types';
import { lostReason, seasonStatus, type SeasonDay } from './seasons';
import type { DayStatus } from './verdict-display';

/** Flights taking off this close (km) count as flown from the launch. */
export const FLOWN_RADIUS_KM = 2;
/** A launch's flown days are fetched again once they are this old (hours). */
export const FLOWN_REFRESH_HOURS = 6;

/** What Syncing Pilots' FlownDaysApi takes (its app/lib/flown-days.ts). */
export interface FlownDaysQuery {
  latitude: number;
  longitude: number;
  altitude: number | null;
  radiusKm: number;
  /** First and last local day, YYYY-MM-DD, at most 800 days. */
  from: string;
  to: string;
  timeZone: string;
}

/** One local day with at least one launch. */
export interface FlownDay {
  date: string;
  /** Different pilots who launched */
  pilots: number;
  launches: number;
  /** Launches by the flight they gave: short glides down, soaring, cross-country (10 km or more) */
  sled: number;
  soared: number;
  xc: number;
  longestMinutes: number | null;
  /** Highest any flight got, m above sea level */
  topAltitude: number | null;
  /** Local times, HH:MM */
  firstTakeoff: string | null;
  lastLanding: string | null;
}

export interface FlownDaysResult {
  query: FlownDaysQuery;
  /** Days with a launch, oldest first */
  days: FlownDay[];
}

/** The first day to ask for: the start of the month two years back, so the season's days are covered. */
export function flownFrom(today: string): string {
  const year = Number(today.slice(0, 4)) - 2;
  return `${year}-${today.slice(5, 7)}-01`;
}

/** A launch's cache key: the place rounded to about 10 m, its height, and its time zone. */
export function flownKey(q: Pick<FlownDaysQuery, 'latitude' | 'longitude' | 'altitude' | 'radiusKm' | 'timeZone'>): string {
  return [
    q.latitude.toFixed(4),
    q.longitude.toFixed(4),
    q.altitude == null ? '-' : Math.round(q.altitude),
    q.radiusKm,
    q.timeZone,
  ].join('|');
}

/** A day that gave more than a glide down. */
export function soaringDay(day: FlownDay): boolean {
  return day.soared + day.xc > 0;
}

/** How SoarCast rated the days pilots flew, over the days it rated. */
export interface FlownCheck {
  /** Rated days, and how many of them someone flew */
  ratedDays: number;
  flownDays: number;
  /** Flown days with soaring or cross-country flights */
  soaringDays: number;
  /** The flown days by what SoarCast called them, for the goal */
  flownByStatus: Record<DayStatus, number>;
  /** Why flown days were called not flyable or marginal, most common first */
  missedBy: Array<{ reason: string; days: number }>;
  /** Of the days rated each way, how many someone flew */
  ratedByStatus: Record<DayStatus, { days: number; flown: number }>;
  /** Soaring days the forecast gave only a glide down (or no flight) */
  soaringCalledSled: number;
}

const statuses = (): Record<DayStatus, number> => ({ go: 0, flyable: 0, marginal: 0, no: 0 });

/** Compares a season's rated days with the days flown in the same span. */
export function checkAgainstFlown(season: SeasonDay[], flown: FlownDay[], goal: SiteGoal): FlownCheck {
  const byDate = new Map(flown.map((d) => [d.date, d]));
  const check: FlownCheck = {
    ratedDays: season.length,
    flownDays: 0,
    soaringDays: 0,
    flownByStatus: statuses(),
    missedBy: [],
    ratedByStatus: {
      go: { days: 0, flown: 0 },
      flyable: { days: 0, flown: 0 },
      marginal: { days: 0, flown: 0 },
      no: { days: 0, flown: 0 },
    },
    soaringCalledSled: 0,
  };
  const missed = new Map<string, number>();
  for (const day of season) {
    const status = seasonStatus(day, goal);
    check.ratedByStatus[status].days++;
    const f = byDate.get(day.date);
    if (!f) continue;
    check.flownDays++;
    check.ratedByStatus[status].flown++;
    check.flownByStatus[status]++;
    if (status === 'no' || status === 'marginal') {
      const reason = lostReason(day, goal) ?? 'other';
      missed.set(reason, (missed.get(reason) ?? 0) + 1);
    }
    if (soaringDay(f)) {
      check.soaringDays++;
      if (day.verdict !== 'go' || !day.flight || day.flight === 'sled') check.soaringCalledSled++;
    }
  }
  check.missedBy = [...missed]
    .map(([reason, days]) => ({ reason, days }))
    .sort((a, b) => b.days - a.days);
  return check;
}

/** Share of days flown in each calendar month (index 0 = Jan) over the season's span. */
export function flownShareByMonth(season: SeasonDay[], flown: FlownDay[]): Array<number | null> {
  const flownDates = new Set(flown.map((d) => d.date));
  const rated = Array.from({ length: 12 }, () => 0);
  const hit = Array.from({ length: 12 }, () => 0);
  for (const day of season) {
    const i = Number(day.date.slice(5, 7)) - 1;
    rated[i]++;
    if (flownDates.has(day.date)) hit[i]++;
  }
  return rated.map((n, i) => (n ? hit[i] / n : null));
}

/** What a site page shows of the days flown there. */
export interface FlownHere {
  /** The span asked for, YYYY-MM-DD */
  fromDate: string;
  toDate: string;
  /** Days with a launch in that span */
  flownDays: number;
  /** The latest days flown, newest first */
  recent: FlownDay[];
  /** Against the season's rated days, when the site has a season */
  check: FlownCheck | null;
  /** Share of days flown by calendar month (index 0 = Jan), over the season's span */
  byMonth: Array<number | null> | null;
}

export function flownHere(
  flown: { days: FlownDay[]; fromDate: string; toDate: string },
  season: SeasonDay[] | null,
  goal: SiteGoal,
  recentDays = 3,
): FlownHere {
  return {
    fromDate: flown.fromDate,
    toDate: flown.toDate,
    flownDays: flown.days.length,
    recent: flown.days.slice(-recentDays).reverse(),
    check: season?.length ? checkAgainstFlown(season, flown.days, goal) : null,
    byMonth: season?.length ? flownShareByMonth(season, flown.days) : null,
  };
}

/** Fewer flown days than this are too few to show by month. */
const MIN_DAYS_BY_MONTH = 10;

/** The by-month shares a Season card shows, or null when too few days were flown. */
export function flownByMonthToShow(flown: FlownHere | null): Array<number | null> | null {
  return flown && flown.flownDays >= MIN_DAYS_BY_MONTH ? flown.byMonth : null;
}
