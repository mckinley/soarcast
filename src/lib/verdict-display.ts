// How a day looks on screen: whether it's a go for the pilot's goal at the
// site, the flight it gives, a short reason when it isn't flyable, and day
// names relative to the site's own today.

import type { DayScore, FlightType } from '@/types';

/**
 * go: flyable and gives the flight the pilot's goal asks for. flyable: safe
 * to launch, but less than the goal (a sled ride where they want to soar).
 */
export type DayStatus = 'go' | 'flyable' | 'marginal' | 'no';

type StatusDay = Pick<DayScore, 'verdict' | 'goalMet'>;
type HeadlineDay = Pick<
  DayScore,
  'verdict' | 'goalMet' | 'flight' | 'flightWindow' | 'flyableWindow'
>;

export function dayStatus(day: StatusDay): DayStatus {
  if (day.verdict !== 'go') return day.verdict;
  return day.goalMet === false ? 'flyable' : 'go';
}

export const STATUS_WORD: Record<DayStatus, string> = {
  go: 'Go',
  flyable: 'Flyable',
  marginal: 'Marginal',
  no: 'Not flyable',
};

/** Solid badge for a day. */
export const STATUS_BADGE: Record<DayStatus, string> = {
  go: 'bg-green-600 text-white',
  flyable: 'bg-green-100 text-green-900 dark:bg-green-900/60 dark:text-green-100',
  marginal: 'bg-amber-400 text-gray-900',
  no: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

/** Soft cell background for a day, for grids. */
export const STATUS_CELL: Record<DayStatus, string> = {
  go: 'bg-green-500/30 text-green-950 dark:text-green-100 hover:bg-green-500/40',
  flyable: 'bg-green-500/10 text-green-800 dark:text-green-300 hover:bg-green-500/20',
  marginal: 'bg-amber-400/20 text-amber-900 dark:text-amber-300 hover:bg-amber-400/30',
  no: 'bg-muted/60 text-muted-foreground hover:bg-muted',
};

export const STATUS_DOT: Record<DayStatus, string> = {
  go: 'bg-green-600',
  flyable: 'bg-green-300 dark:bg-green-800',
  marginal: 'bg-amber-400',
  no: 'bg-slate-300 dark:bg-slate-600',
};

export const FLIGHT_WORD: Record<FlightType, string> = {
  sled: 'Sled ride',
  ridge: 'Ridge soaring',
  thermal: 'Thermals',
  xc: 'XC day',
};

/** For small cells. */
export const FLIGHT_SHORT: Record<FlightType, string> = {
  sled: 'Sled',
  ridge: 'Ridge',
  thermal: 'Thermals',
  xc: 'XC',
};

const FLIGHT_PHRASE: Record<FlightType, string> = {
  sled: 'sled ride',
  ridge: 'ridge soaring',
  thermal: 'thermals',
  xc: 'XC day',
};

/** When the day's flight works: its soaring hours, or the whole window for a sled ride. */
export function flightTime(day: Pick<DayScore, 'flight' | 'flightWindow' | 'flyableWindow'>) {
  return (day.flight !== 'sled' && day.flightWindow) || day.flyableWindow;
}

/** "Go: thermals 12:00-16:00", "Flyable: sled ride 10:00-17:00", "Marginal 11:00-14:00". */
export function dayHeadline(day: HeadlineDay): string {
  const status = dayStatus(day);
  if (status === 'no') return STATUS_WORD.no;
  if (status === 'marginal') return `Marginal ${day.flyableWindow ?? ''}`.trim();
  const flight = day.flight ? `${FLIGHT_PHRASE[day.flight]} ` : '';
  return `${STATUS_WORD[status]}: ${flight}${flightTime(day) ?? ''}`.trim();
}

/** The word for a small cell: the flight on a flyable day, else the status. */
export function cellLabel(day: HeadlineDay): string {
  const status = dayStatus(day);
  if ((status === 'go' || status === 'flyable') && day.flight) return FLIGHT_SHORT[day.flight];
  return STATUS_WORD[status];
}

/** The second line of a small cell: when on a flyable day, what stops it otherwise. */
export function cellDetail(day: DayScore): string | null {
  if (day.verdict === 'no') return shortReason(day);
  if (day.verdict === 'marginal') return compactWindow(day.flyableWindow);
  return compactWindow(flightTime(day));
}

const SHORT_REASON: Record<string, string> = {
  direction: 'Wrong wind',
  wind: 'Too windy',
  gusts: 'Gusty',
  rain: 'Rain',
  storm: 'Storms',
  cloud: 'In cloud',
  visibility: 'Fog',
  daylight: 'Dark',
};

/** A few words on what keeps a day from being flyable, for small cells. */
export function shortReason(day: DayScore): string | null {
  if (day.verdict === 'go') return null;
  return (day.limitingGate && SHORT_REASON[day.limitingGate]) ?? null;
}

/** "11-16" from "11:00-16:00", for tight spaces. */
export function compactWindow(window: string | null | undefined): string | null {
  if (!window) return null;
  return window.replace(/:00/g, '');
}

/** Best first: a go, then the better flight, then the better soaring. */
const STATUS_RANK: Record<DayStatus, number> = { go: 3, flyable: 2, marginal: 1, no: 0 };
const FLIGHT_RANK: Record<FlightType, number> = { xc: 3, thermal: 2, ridge: 1, sled: 0 };

export function compareDays(a: DayScore, b: DayScore): number {
  return (
    STATUS_RANK[dayStatus(b)] - STATUS_RANK[dayStatus(a)] ||
    (b.flight ? FLIGHT_RANK[b.flight] : -1) - (a.flight ? FLIGHT_RANK[a.flight] : -1) ||
    b.overallScore - a.overallScore
  );
}

/** "Today", "Tomorrow" or "Wed", for `date` relative to the site's `today` (both YYYY-MM-DD). */
export function dayName(date: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

/** "Oct 21" for a YYYY-MM-DD date. */
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
