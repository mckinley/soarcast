// A site's seasons: every past day rated by the forecast engine on archived
// forecasts (scripts/seasons/build.ts), kept compactly per site in
// site_seasons, and summed into months for the pilot's goal.

import type { DayScore, FlightType, SiteGoal } from '@/types';
import type { LaunchProfile } from './forecast-engine';
import { meetsGoal } from './site-goals';
import { dayStatus, type DayStatus } from './verdict-display';

/** One past day: what the engine said, enough to judge it for any goal. */
export interface SeasonDay {
  date: string; // YYYY-MM-DD, the site's local date
  verdict: DayScore['verdict'];
  flight: FlightType | null;
  greatDay: boolean;
  /** The launch check that held the day back, when it was held back */
  gate: string | null;
}

const VERDICT_CODE: Record<SeasonDay['verdict'], string> = { go: 'g', marginal: 'm', no: 'n' };
const FLIGHT_CODE: Record<FlightType, string> = { sled: 's', ridge: 'r', thermal: 't', xc: 'x' };
const GATE_CODE: Record<string, string> = {
  daylight: 'd',
  direction: 'i',
  wind: 'w',
  gusts: 'u',
  rain: 'r',
  cloud: 'c',
  visibility: 'v',
  storm: 's',
};

function invert(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
}
const VERDICT_OF = invert(VERDICT_CODE) as Record<string, SeasonDay['verdict']>;
const FLIGHT_OF = invert(FLIGHT_CODE) as Record<string, FlightType>;
const GATE_OF = invert(GATE_CODE);

export function seasonDayFromScore(score: DayScore): SeasonDay {
  return {
    date: score.date,
    verdict: score.verdict,
    flight: score.flight ?? null,
    greatDay: !!score.greatDay,
    gate: score.verdict === 'go' ? null : (score.limitingGate ?? null),
  };
}

/** "20250714gx1-" per day (date, verdict, flight, great day, gate), comma-separated. */
export function encodeSeasonDays(days: SeasonDay[]): string {
  return days
    .map(
      (d) =>
        `${d.date.replace(/-/g, '')}${VERDICT_CODE[d.verdict]}${d.flight ? FLIGHT_CODE[d.flight] : '-'}${
          d.greatDay ? 1 : 0
        }${d.gate ? (GATE_CODE[d.gate] ?? '?') : '-'}`,
    )
    .join(',');
}

export function decodeSeasonDays(encoded: string): SeasonDay[] {
  if (!encoded) return [];
  return encoded.split(',').map((s) => ({
    date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
    verdict: VERDICT_OF[s[8]] ?? 'no',
    flight: FLIGHT_OF[s[9]] ?? null,
    greatDay: s[10] === '1',
    gate: s[11] === '-' ? null : (GATE_OF[s[11]] ?? 'other'),
  }));
}

function statusFor(day: SeasonDay, goal: SiteGoal): DayStatus {
  return dayStatus({ verdict: day.verdict, goalMet: meetsGoal(day, goal) });
}

/** Why a day wasn't a go for the goal: a launch check, or "weak" when it flew but gave less. */
export function lostReason(day: SeasonDay, goal: SiteGoal): string | null {
  if (statusFor(day, goal) === 'go') return null;
  if (day.verdict === 'go') return 'weak';
  return day.gate ?? 'other';
}

export const LOST_REASON_WORD: Record<string, string> = {
  rain: 'rain',
  wind: 'too much wind',
  gusts: 'gusts',
  direction: 'the wrong wind direction',
  cloud: 'low cloud',
  visibility: 'fog',
  storm: 'storms',
  daylight: 'short days',
  weak: 'too little lift for your goal',
  other: 'other checks',
};

export interface SeasonMonth {
  month: number; // 1-12
  days: number;
  counts: Record<DayStatus, number>;
  /** Share of days that were a go for the goal, 0-1 */
  goShare: number;
  /** Why the other days weren't, most common first */
  lost: Array<{ reason: string; days: number }>;
}

/** The past days summed by calendar month, for a goal. */
export function seasonMonths(days: SeasonDay[], goal: SiteGoal): SeasonMonth[] {
  const months: SeasonMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    days: 0,
    counts: { go: 0, flyable: 0, marginal: 0, no: 0 },
    goShare: 0,
    lost: [],
  }));
  const lost = months.map(() => new Map<string, number>());
  for (const day of days) {
    const i = Number(day.date.slice(5, 7)) - 1;
    months[i].days++;
    months[i].counts[statusFor(day, goal)]++;
    const reason = lostReason(day, goal);
    if (reason) lost[i].set(reason, (lost[i].get(reason) ?? 0) + 1);
  }
  for (const [i, m] of months.entries()) {
    m.goShare = m.days ? m.counts.go / m.days : 0;
    m.lost = [...lost[i]]
      .map(([reason, n]) => ({ reason, days: n }))
      .sort((a, b) => b.days - a.days);
  }
  return months;
}

/** A site's season for the pilot's goal: what pages show, without the day list. */
export interface SeasonSummary {
  months: SeasonMonth[];
  best: { text: string; share: number } | null;
  /** Go days for the goal in a typical week around the site's today */
  typicalWeek: number | null;
  fromDate: string;
  toDate: string;
  /** False when the row was rated with other launch settings than the pilot's now */
  sameSettings: boolean;
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The best months in words, "Jun to Aug" or "Apr, May and Sep": the months
 * within a few points of the best one. Null when no month is ever a go.
 */
export function bestMonths(months: SeasonMonth[]): { text: string; share: number } | null {
  const rated = months.filter((m) => m.days > 0);
  const top = Math.max(0, ...rated.map((m) => m.goShare));
  if (top === 0) return null;
  const best = rated.filter((m) => m.goShare >= top * 0.8).map((m) => m.month);
  const share = best.reduce((s, m) => s + months[m - 1].goShare, 0) / best.length;
  // A run of months, allowing one across New Year, reads as a range
  const set = new Set(best);
  const start = best.find((m) => !set.has(m === 1 ? 12 : m - 1)) ?? best[0];
  const run: number[] = [];
  for (let m = start; set.has(m) && run.length < 12; m = m === 12 ? 1 : m + 1) run.push(m);
  if (run.length === best.length && run.length >= 3) {
    return { text: `${MONTH[run[0] - 1]} to ${MONTH[run[run.length - 1] - 1]}`, share };
  }
  const names = best.map((m) => MONTH[m - 1]);
  const text =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return { text, share };
}

function dayOfYear(date: string): number {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((t - Date.UTC(Number(date.slice(0, 4)), 0, 1)) / 864e5);
}

/**
 * How many days of a week around `date` were a go for the goal in past
 * years: the go share within `windowDays` either side of the same day of
 * the year, times seven. Null with too few past days to say.
 */
export function typicalWeekGoDays(
  days: SeasonDay[],
  goal: SiteGoal,
  date: string,
  windowDays = 15,
): number | null {
  const target = dayOfYear(date);
  let n = 0;
  let go = 0;
  for (const day of days) {
    const diff = Math.abs(dayOfYear(day.date) - target);
    if (Math.min(diff, 365 - diff) > windowDays) continue;
    n++;
    if (statusFor(day, goal) === 'go') go++;
  }
  return n >= windowDays ? (go / n) * 7 : null;
}

/**
 * A short key for what the engine rated a site with, besides the goal (which
 * is applied when reading): the same launch rated the same way shares one row.
 */
export function launchProfileKey(launch: LaunchProfile): string {
  const text = JSON.stringify([
    Math.round(launch.elevation),
    [...launch.goodDirections].sort((a, b) => a - b),
    [...launch.okDirections].sort((a, b) => a - b),
    launch.maxWindSpeed,
    launch.kind ?? null,
  ]);
  // FNV-1a, 32 bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
