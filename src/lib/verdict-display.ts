// How a day looks on screen: whether it's a go for the pilot's goal at the
// site, the flight it gives, a short reason when it isn't flyable, and day
// names relative to the site's own today.

import type { DayScore, FlightType } from '@/types';
import { sledReasonText } from '@/lib/forecast-engine';

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

// One look for each day word on every screen (colors in app/globals.css): Go
// solid green, Flyable pale green with an outline, Marginal soft amber with an
// outline, Not flyable flat grey. They differ in lightness, not only in hue.

/** Badge for a day. */
export const STATUS_BADGE: Record<DayStatus, string> = {
  go: 'bg-go text-go-foreground',
  flyable: 'bg-flyable text-flyable-foreground ring-1 ring-inset ring-flyable-border',
  marginal: 'bg-marginal text-marginal-foreground ring-1 ring-inset ring-marginal-border',
  no: 'bg-nofly text-nofly-foreground',
};

/** A day's cell in a grid or a day picker. */
export const STATUS_CELL: Record<DayStatus, string> = {
  go: 'bg-go text-go-foreground hover:brightness-110',
  flyable:
    'bg-flyable text-flyable-foreground ring-[1.5px] ring-inset ring-flyable-border hover:brightness-[0.97] dark:hover:brightness-125',
  marginal:
    'bg-marginal text-marginal-foreground ring-[1.5px] ring-inset ring-marginal-border hover:brightness-[0.97] dark:hover:brightness-125',
  no: 'bg-nofly text-nofly-foreground hover:brightness-[0.97] dark:hover:brightness-125',
};

/** A small swatch or dot for a day. */
export const STATUS_DOT: Record<DayStatus, string> = {
  go: 'bg-go',
  flyable: 'bg-flyable-border',
  marginal: 'bg-marginal-border',
  no: 'bg-nofly-border',
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

/**
 * What goes beside the day's word: "Thermals 12:00-16:00" on a flyable day,
 * "16:00-19:00, fly with care" on a marginal one, what stops it otherwise.
 */
export function dayTitle(day: DayScore): string {
  const status = dayStatus(day);
  if (status === 'no') return shortReason(day) ?? 'No flyable hours';
  if (status === 'marginal')
    return `${day.flyableWindow ?? ''}, fly with care`.replace(/^, f/, 'F');
  const flight = day.flight ? `${FLIGHT_WORD[day.flight]} ` : '';
  return `${flight}${flightTime(day) ?? ''}`.trim();
}

/**
 * The day in a sentence or two, after its word and title: when it is safe to
 * launch, and how the flight goes. Null on a day that isn't flyable, whose
 * reasons say it all.
 */
export function daySentence(day: DayScore): string | null {
  const status = dayStatus(day);
  if (status === 'no') return null;
  const parts: string[] = [];
  if (status !== 'marginal' && day.flyableWindow && flightTime(day) !== day.flyableWindow) {
    parts.push(`Safe to launch ${day.flyableWindow}.`);
  }
  // The title of a marginal day gives its launch window, not the flight's hours
  const when = status === 'marginal' && day.flightWindow ? ` ${day.flightWindow}` : '';
  const climb = day.wStar ? ` climb about ${day.wStar.toFixed(1)} m/s` : '';
  const height =
    day.topOfLiftAboveLaunch && day.topOfLiftAboveLaunch > 0
      ? ` to ${day.topOfLiftAboveLaunch.toLocaleString('en-US')} m above launch`
      : '';
  switch (day.flight) {
    case 'xc':
    case 'thermal':
      if (day.flight === 'xc') parts.push('An XC day.');
      if (climb || height) parts.push(`Thermals${when}${climb}${height}.`);
      break;
    case 'ridge':
      parts.push(`Ridge soaring${when} in wind onto the launch.`);
      break;
    case 'sled': {
      const why = day.sled && sledReasonText(day.sled, (m) => `${m.toLocaleString('en-US')} m`);
      if (why) parts.push(`A sled ride: ${why}.`);
      break;
    }
  }
  return parts.length > 0 ? parts.join(' ') : null;
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
  return weekdayShort(date);
}

/** "Wed" for a YYYY-MM-DD date. */
export function weekdayShort(date: string): string {
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

/** "Today", "Tomorrow" or "Fri Oct 30", for `date` relative to the site's `today`. */
export function dayLabel(date: string, today: string): string {
  const name = dayName(date, today);
  return name === 'Today' || name === 'Tomorrow' ? name : `${name} ${shortDate(date)}`;
}

/** "Friday, October 30" for a YYYY-MM-DD date. */
export function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
