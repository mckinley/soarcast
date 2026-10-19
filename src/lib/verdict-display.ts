// How a day verdict looks on screen: the word, its colours, a short reason
// and day names relative to the site's own today.

import type { DayScore } from '@/types';

type Verdict = DayScore['verdict'];

export const VERDICT_WORD: Record<Verdict, string> = {
  go: 'Flyable',
  marginal: 'Marginal',
  no: 'Not flyable',
};

/** Solid badge for a verdict. */
export const VERDICT_BADGE: Record<Verdict, string> = {
  go: 'bg-green-600 text-white',
  marginal: 'bg-amber-400 text-gray-900',
  no: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

/** Soft cell background for a verdict, for grids. */
export const VERDICT_CELL: Record<Verdict, string> = {
  go: 'bg-green-500/15 text-green-800 dark:text-green-300 hover:bg-green-500/25',
  marginal: 'bg-amber-400/20 text-amber-900 dark:text-amber-300 hover:bg-amber-400/30',
  no: 'bg-muted/60 text-muted-foreground hover:bg-muted',
};

export const VERDICT_DOT: Record<Verdict, string> = {
  go: 'bg-green-600',
  marginal: 'bg-amber-400',
  no: 'bg-slate-300 dark:bg-slate-600',
};

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
