// A site's seasons: every past day rated by the forecast engine on ERA5, the
// record of past weather (jobs/season-build.ts), kept compactly per site in
// site_seasons, and summed into months for the pilot's goal.

import type { DayScore, FlightType, SiteGoal } from '@/types';
import type { LaunchProfile } from './forecast-engine';
import { meetsGoal } from './site-goals';
import { dayStatus, type DayStatus } from './verdict-display';

/** Years of past weather a season is rated over, in whole months ending with last month. */
export const SEASON_YEARS = 20;

/** Whole months of past days kept day by day, for checks against flown days. */
export const SEASON_MONTHS = 24;

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

/** What a past day was for the goal: Go, Flyable, Marginal or Not flyable. */
export function seasonStatus(day: SeasonDay, goal: SiteGoal): DayStatus {
  return dayStatus({ verdict: day.verdict, goalMet: meetsGoal(day, goal) });
}

/** Why a day wasn't a go for the goal: a launch check, or "weak" when it flew but gave less. */
export function lostReason(day: SeasonDay, goal: SiteGoal): string | null {
  if (seasonStatus(day, goal) === 'go') return null;
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
  weak: 'too little lift for the goal',
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
    months[i].counts[seasonStatus(day, goal)]++;
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

/**
 * Go share by calendar month (index 0 = Jan) for an area: a day counts as a
 * go when any of its launches was a go for the goal, as a pilot there picks
 * the launch the day suits.
 */
export function anyGoShares(launches: SeasonDay[][], goal: SiteGoal): number[] {
  return anyGoSharesFromStats(launches.map(seasonStats), goal);
}

/** A site's season for the pilot's goal: what pages show, without the day list. */
export interface SeasonSummary {
  months: SeasonMonth[];
  best: { text: string; share: number } | null;
  /** Go days for the goal in a typical week around the site's today */
  typicalWeek: number | null;
  /** How much each month's go days change from year to year (index 0 = Jan) */
  spread: Array<MonthSpread | null>;
  /** Years of days rated, rounded */
  years: number;
  /** What the days were rated on: the record of past weather, or archived forecasts (older rows) */
  source: 'era5' | 'forecast';
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
  return topMonths(months.map((m) => (m.days > 0 ? m.goShare : null)));
}

/**
 * The months (index 0 = Jan) within a few points of the top share, in words,
 * with their average share. Null when every share is zero or missing.
 */
export function topMonths(shares: Array<number | null>): { text: string; share: number } | null {
  const top = Math.max(0, ...shares.map((v) => v ?? 0));
  if (top === 0) return null;
  const best = shares.flatMap((v, i) => (v != null && v >= top * 0.8 ? [i + 1] : []));
  const share = best.reduce((sum, m) => sum + (shares[m - 1] ?? 0), 0) / best.length;
  // Nearly every month reads as the months left out
  if (best.length >= 9) {
    const rest = MONTH.filter((_, i) => !best.includes(i + 1));
    if (rest.length === 0) return { text: 'every month', share };
    const last = rest.pop()!;
    return { text: `every month but ${rest.length ? `${rest.join(', ')} and ` : ''}${last}`, share };
  }
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
  return statsTypicalWeek(seasonStats(days), goal, date, windowDays);
}

// ------------------------------------------------------------ stored seasons

const GOALS: SiteGoal[] = ['launch', 'soar', 'great'];

/** A month's days for a goal, as stored. */
export interface MonthCounts {
  go: number;
  flyable: number;
  marginal: number;
  no: number;
  /** Why the days that weren't a go weren't, by reason */
  lost: Record<string, number>;
}

/**
 * A season as site_seasons.summary keeps it: each goal's days summed by
 * month, and which days were rated and which were a go, one bit a day
 * (base64). The bits let pages join an area's launches day by day and tell
 * a month's years apart without the day list. About 7 KB for 20 years.
 */
export interface SeasonStats {
  /** The day the first bit stands for, YYYY-MM-DD */
  from: string;
  /** Days the bits cover */
  length: number;
  rated: string;
  goals: Record<SiteGoal, { go: string; months: MonthCounts[] }>;
}

const DAY_MS = 864e5;

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/** Year, month (1-12) and day of the year (0-365) of a day counted from 1970-01-01. */
function civil(n: number): { year: number; month: number; yearDay: number } {
  const date = new Date(n * DAY_MS);
  const year = date.getUTCFullYear();
  return {
    year,
    month: date.getUTCMonth() + 1,
    yearDay: n - Math.round(Date.UTC(year, 0, 1) / DAY_MS),
  };
}

// Calendar months of a run of days, worked out once per run
const monthRuns = new Map<string, Uint8Array>();
function monthsOf(first: number, length: number): Uint8Array {
  const key = `${first}:${length}`;
  let months = monthRuns.get(key);
  if (!months) {
    months = new Uint8Array(length);
    for (let i = 0; i < length; i++) months[i] = civil(first + i).month - 1;
    if (monthRuns.size > 50) monthRuns.clear();
    monthRuns.set(key, months);
  }
  return months;
}

function packBits(bits: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((b, i) => {
    if (b) bytes[i >> 3] |= 1 << (i & 7);
  });
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function unpackBits(packed: string, length: number): Uint8Array {
  const text = atob(packed);
  const bits = new Uint8Array(length);
  for (let i = 0; i < length; i++) bits[i] = (text.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return bits;
}

const unpacked = new WeakMap<SeasonStats, { rated: Uint8Array; go: Map<SiteGoal, Uint8Array> }>();

/** A season's rated and go days for a goal, one byte a day. */
function bitsOf(stats: SeasonStats, goal: SiteGoal): { rated: Uint8Array; go: Uint8Array } {
  let cached = unpacked.get(stats);
  if (!cached) {
    cached = { rated: unpackBits(stats.rated, stats.length), go: new Map() };
    unpacked.set(stats, cached);
  }
  let go = cached.go.get(goal);
  if (!go) {
    go = unpackBits(stats.goals[goal].go, stats.length);
    cached.go.set(goal, go);
  }
  return { rated: cached.rated, go };
}

/** Rated days as a season stores them, for every goal. */
export function seasonStats(days: SeasonDay[]): SeasonStats {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const first = sorted.length > 0 ? dayNumber(sorted[0].date) : 0;
  const length = sorted.length > 0 ? dayNumber(sorted[sorted.length - 1].date) - first + 1 : 0;
  const rated = new Uint8Array(length);
  for (const day of sorted) rated[dayNumber(day.date) - first] = 1;
  const goals = Object.fromEntries(
    GOALS.map((goal) => {
      const go = new Uint8Array(length);
      for (const day of sorted) {
        if (seasonStatus(day, goal) === 'go') go[dayNumber(day.date) - first] = 1;
      }
      const months = seasonMonths(sorted, goal).map(
        (m): MonthCounts => ({
          ...m.counts,
          lost: Object.fromEntries(m.lost.map((l) => [l.reason, l.days])),
        }),
      );
      return [goal, { go: packBits(go), months }];
    }),
  ) as SeasonStats['goals'];
  return { from: sorted[0]?.date ?? '', length, rated: packBits(rated), goals };
}

/** A stored season summed by calendar month, for a goal. */
export function statsMonths(stats: SeasonStats, goal: SiteGoal): SeasonMonth[] {
  return stats.goals[goal].months.map((m, i) => {
    const days = m.go + m.flyable + m.marginal + m.no;
    return {
      month: i + 1,
      days,
      counts: { go: m.go, flyable: m.flyable, marginal: m.marginal, no: m.no },
      goShare: days ? m.go / days : 0,
      lost: Object.entries(m.lost)
        .map(([reason, n]) => ({ reason, days: n }))
        .sort((a, b) => b.days - a.days),
    };
  });
}

/** Go share by calendar month (index 0 = Jan) for an area: a day is a go when any launch was. */
export function anyGoSharesFromStats(launches: SeasonStats[], goal: SiteGoal): number[] {
  const withDays = launches.filter((s) => s.length > 0);
  const rated = Array.from({ length: 12 }, () => 0);
  const go = Array.from({ length: 12 }, () => 0);
  if (withDays.length === 0) return rated;
  const starts = withDays.map((s) => dayNumber(s.from));
  const first = Math.min(...starts);
  const length = Math.max(...withDays.map((s, i) => starts[i] + s.length)) - first;
  const anyRated = new Uint8Array(length);
  const anyGo = new Uint8Array(length);
  withDays.forEach((stats, k) => {
    const bits = bitsOf(stats, goal);
    const offset = starts[k] - first;
    for (let i = 0; i < stats.length; i++) {
      anyRated[offset + i] |= bits.rated[i];
      anyGo[offset + i] |= bits.go[i];
    }
  });
  const months = monthsOf(first, length);
  for (let i = 0; i < length; i++) {
    if (!anyRated[i]) continue;
    rated[months[i]]++;
    go[months[i]] += anyGo[i];
  }
  return rated.map((n, i) => (n ? go[i] / n : 0));
}

/** The go share within `windowDays` of the same day of the year, times seven. Null with too few days. */
export function statsTypicalWeek(
  stats: SeasonStats,
  goal: SiteGoal,
  date: string,
  windowDays = 15,
): number | null {
  if (stats.length === 0) return null;
  const { rated, go } = bitsOf(stats, goal);
  const target = civil(dayNumber(date)).yearDay;
  const first = dayNumber(stats.from);
  let n = 0;
  let goDays = 0;
  for (let i = 0; i < stats.length; i++) {
    if (!rated[i]) continue;
    const diff = Math.abs(civil(first + i).yearDay - target);
    if (Math.min(diff, 365 - diff) > windowDays) continue;
    n++;
    goDays += go[i];
  }
  return n >= windowDays ? (goDays / n) * 7 : null;
}

/** How a month's go days change from year to year: in the middle half of years, `low` to `high`. */
export interface MonthSpread {
  low: number;
  high: number;
  /** Years of the month rated */
  years: number;
}

/** Fewer years of a month than this say too little about how it changes. */
export const SPREAD_MIN_YEARS = 5;

function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (at - lo);
}

/** Each calendar month's go days across the years, for a goal (index 0 = Jan). */
export function statsSpread(stats: SeasonStats, goal: SiteGoal): Array<MonthSpread | null> {
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  if (stats.length === 0) return byMonth.map(() => null);
  const { rated, go } = bitsOf(stats, goal);
  const first = dayNumber(stats.from);
  // Rated and go days in each month of each year
  const perMonth = new Map<number, { year: number; month: number; n: number; go: number }>();
  for (let i = 0; i < stats.length; i++) {
    if (!rated[i]) continue;
    const { year, month } = civil(first + i);
    const key = year * 12 + month;
    const m = perMonth.get(key) ?? { year, month, n: 0, go: 0 };
    m.n++;
    m.go += go[i];
    perMonth.set(key, m);
  }
  for (const m of perMonth.values()) {
    const days = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
    // A month counts when most of it was rated, its go days scaled to the whole month
    if (m.n >= days * 0.8) byMonth[m.month - 1].push((m.go / m.n) * days);
  }
  return byMonth.map((xs) => {
    if (xs.length < SPREAD_MIN_YEARS) return null;
    xs.sort((a, b) => a - b);
    return {
      low: Math.round(quantile(xs, 0.25)),
      high: Math.round(quantile(xs, 0.75)),
      years: xs.length,
    };
  });
}

/** What a page shows of a stored season for the pilot's goal. */
export function summaryFromStats(
  stats: SeasonStats,
  goal: SiteGoal,
  today: string,
): Pick<SeasonSummary, 'months' | 'best' | 'typicalWeek' | 'spread' | 'years'> {
  const months = statsMonths(stats, goal);
  const rated = months.reduce((sum, m) => sum + m.days, 0);
  return {
    months,
    best: bestMonths(months),
    typicalWeek: statsTypicalWeek(stats, goal, today),
    spread: statsSpread(stats, goal),
    years: Math.round(rated / 365.25),
  };
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
