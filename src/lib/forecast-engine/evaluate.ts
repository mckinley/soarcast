// Day verdicts for a launch: gates hour by hour, then the longest flyable
// window, then how good the soaring is inside it, then hazards. This is the
// one place SoarCast decides whether a day is flyable.

import type { AtmosphericProfile } from '@/lib/weather-profile';
import type { DayScore, FlightType, SiteKind, SledReason } from '@/types';
import { defaultGoal, meetsGoal } from '@/lib/site-goals';
import { deriveLaunchConditions, type LaunchConditions } from './launch-conditions';
import {
  angleDifference,
  evaluateGates,
  SECTOR_HALF_WIDTH,
  THERMAL_MIN_WSTAR,
  worstStatus,
  type GateName,
  type GateResult,
  type GateStatus,
  type LaunchProfile,
} from './gates';

export interface HourVerdict {
  time: string;
  hour: number;
  status: GateStatus;
  gates: GateResult[];
  conditions: LaunchConditions;
}

/** A day needs this many consecutive good hours to count as flyable. */
export const MIN_WINDOW_HOURS = 2;

/**
 * Below this much lift above launch, a flight is a sled ride down, or a
 * short scratch at best. At 300 m nearly every summer day at a foothill
 * launch counted as soarable.
 */
export const SOAR_MIN_HEIGHT = 500; // m
/** Strong climbs to a high ceiling for long enough to go somewhere. */
export const XC_MIN_WSTAR = 1.8; // m/s
export const XC_MIN_HEIGHT = 1000; // m above launch
export const XC_MIN_HOURS = 3;
/** Wind straight onto the launch it takes to hold a paraglider up in ridge lift. */
export const RIDGE_MIN_KMH = 15;
/** Hours of thermals or ridge lift that make a day soarable. */
export const SOAR_MIN_HOURS = 2;
/** At a ridge site, a ridge day this long is a great one. */
export const GREAT_RIDGE_HOURS = 4;

interface Window {
  start: number; // index into the day's hours
  end: number; // inclusive
}

function longestRun(hours: HourVerdict[], ok: (h: HourVerdict) => boolean): Window | null {
  let best: Window | null = null;
  let start = -1;
  hours.forEach((h, i) => {
    if (ok(h)) {
      if (start < 0) start = i;
      if (!best || i - start > best.end - best.start) best = { start, end: i };
    } else {
      start = -1;
    }
  });
  return best;
}

/**
 * The go window grown through the marginal daylight hours either side of
 * it: the stretch a pilot could fly. One gusty or cross hour then no longer
 * cuts the day's flight down to a short scrap of morning.
 */
function flyableStretch(hours: HourVerdict[], w: Window): HourVerdict[] {
  const flyable = (h: HourVerdict) =>
    h.status !== 'fail' && h.gates.every((g) => g.gate !== 'daylight' || g.status === 'pass');
  let { start, end } = w;
  while (start > 0 && flyable(hours[start - 1])) start--;
  while (end < hours.length - 1 && flyable(hours[end + 1])) end++;
  return hours.slice(start, end + 1);
}

function windowLength(w: Window | null): number {
  return w ? w.end - w.start + 1 : 0;
}

function formatWindow(hours: HourVerdict[], w: Window | null): string | null {
  if (!w) return null;
  const pad = (n: number) => `${String(n).padStart(2, '0')}:00`;
  return `${pad(hours[w.start].hour)}-${pad(hours[w.end].hour + 1)}`;
}

/** Hours as their contiguous spans: [7, 8, 17, 18] -> "07:00-09:00 and 17:00-19:00". */
export function formatHours(hours: number[]): string {
  const pad = (n: number) => `${String(n).padStart(2, '0')}:00`;
  const sorted = [...new Set(hours)].sort((a, b) => a - b);
  const spans: string[] = [];
  let start = sorted[0];
  sorted.forEach((h, i) => {
    if (sorted[i + 1] !== h + 1) {
      spans.push(`${pad(start)}-${pad(h + 1)}`);
      start = sorted[i + 1];
    }
  });
  return spans.length > 1
    ? `${spans.slice(0, -1).join(', ')} and ${spans[spans.length - 1]}`
    : (spans[0] ?? '');
}

/**
 * Groups the non-passing gate results of daylight hours into reasons with
 * their time span, most frequent first: "Wind 31 km/h (limit 25), 13:00-17:00".
 */
function summarizeReasons(hours: HourVerdict[]): Array<{ gate: GateName; text: string }> {
  const byGate = new Map<
    GateName,
    { gate: GateName; hours: number[]; reasons: string[]; fail: boolean }
  >();
  for (const h of hours) {
    if (h.gates.some((g) => g.gate === 'daylight' && g.status === 'fail')) continue;
    for (const g of h.gates) {
      if (g.status === 'pass' || g.gate === 'daylight') continue;
      const entry = byGate.get(g.gate) ?? { gate: g.gate, hours: [], reasons: [], fail: false };
      entry.hours.push(h.hour);
      entry.reasons.push(g.reason ?? g.gate);
      entry.fail ||= g.status === 'fail';
      byGate.set(g.gate, entry);
    }
  }
  return [...byGate.values()]
    .sort((a, b) => Number(b.fail) - Number(a.fail) || b.hours.length - a.hours.length)
    .map((e) => {
      // The reason from the middle of the span is the most typical one
      const reason = e.reasons[Math.floor(e.reasons.length / 2)];
      return { gate: e.gate, text: `${reason}, ${formatHours(e.hours)}` };
    });
}

function scoreWStar(wStar: number): number {
  // 0 -> 0, 1 m/s -> 35, 2 m/s -> 70, 3+ m/s -> 100
  if (wStar <= 0) return 0;
  if (wStar >= 3) return 100;
  return wStar <= 2 ? wStar * 35 : 70 + (wStar - 2) * 30;
}

function scoreHeight(metersAboveLaunch: number): number {
  // Under SOAR_MIN_HEIGHT above launch is a sled ride; 1,200 m more is plenty
  return Math.max(0, Math.min(100, ((metersAboveLaunch - SOAR_MIN_HEIGHT) / 1200) * 100));
}

const LABELS: Array<[number, DayScore['label']]> = [
  [86, 'Epic'],
  [71, 'Great'],
  [51, 'Good'],
  [31, 'Fair'],
  [0, 'Poor'],
];

export function scoreToLabel(score: number): DayScore['label'] {
  return LABELS.find(([min]) => score >= min)![1];
}

interface Flight {
  flight: FlightType;
  flightWindow: string | null;
  greatDay: boolean;
  sled: DayScore['sled'];
}

/** Why the window's hours give only a sled ride at this launch. */
function sledReason(
  hours: HourVerdict[],
  kind: SiteKind | null,
  liftAboveLaunch: (c: LaunchConditions) => number,
): NonNullable<DayScore['sled']> {
  const reason = (r: SledReason, lift: number | null = null) => ({
    reason: r,
    liftAboveLaunch: lift,
  });
  if (kind === 'sled') return reason('sled-site');
  if (kind === 'ridge') return reason('ridge-wind');
  const climbable = hours.filter((h) => (h.conditions.wStar ?? 0) >= THERMAL_MIN_WSTAR);
  if (climbable.length === 0) return reason('weak');
  const top = Math.round(Math.max(...climbable.map((h) => liftAboveLaunch(h.conditions))));
  if (top <= 0) return reason('below-launch', top);
  return reason(top < SOAR_MIN_HEIGHT ? 'low' : 'short', top);
}

/**
 * The best flight the window's hours give at this launch: an XC day,
 * thermals, ridge soaring, or a sled ride. A site's kind rules some out: a
 * ridge-only site never thermals, and a sled-only site never soars.
 */
function classifyFlight(
  hours: HourVerdict[],
  launch: LaunchProfile,
  odRisk: DayScore['odRisk'],
): Flight {
  const kind = launch.kind ?? null;
  const canThermal = kind !== 'ridge' && kind !== 'sled';
  // Ridge lift needs the launch's own directions to know which wind is onto it
  const canRidge = kind !== 'thermal' && kind !== 'sled' && launch.goodDirections.length > 0;

  const liftAboveLaunch = (c: LaunchConditions) =>
    c.topOfLiftMsl !== null ? c.topOfLiftMsl - launch.elevation : 0;
  const thermals = (min: number, height: number) => (h: HourVerdict) =>
    (h.conditions.wStar ?? 0) >= min && liftAboveLaunch(h.conditions) >= height;
  const ridgeLift = (h: HourVerdict) =>
    h.conditions.windSpeed >= RIDGE_MIN_KMH &&
    launch.goodDirections.some(
      (d) => angleDifference(h.conditions.windDirection, d) <= SECTOR_HALF_WIDTH,
    );

  const xc = canThermal ? longestRun(hours, thermals(XC_MIN_WSTAR, XC_MIN_HEIGHT)) : null;
  if (windowLength(xc) >= XC_MIN_HOURS && odRisk !== 'high') {
    return { flight: 'xc', flightWindow: formatWindow(hours, xc), greatDay: true, sled: null };
  }
  const thermal = canThermal
    ? longestRun(hours, thermals(THERMAL_MIN_WSTAR, SOAR_MIN_HEIGHT))
    : null;
  if (windowLength(thermal) >= SOAR_MIN_HOURS) {
    return {
      flight: 'thermal',
      flightWindow: formatWindow(hours, thermal),
      greatDay: false,
      sled: null,
    };
  }
  const ridge = canRidge ? longestRun(hours, ridgeLift) : null;
  if (windowLength(ridge) >= SOAR_MIN_HOURS) {
    return {
      flight: 'ridge',
      flightWindow: formatWindow(hours, ridge),
      greatDay: kind === 'ridge' && windowLength(ridge) >= GREAT_RIDGE_HOURS,
      sled: null,
    };
  }
  return {
    flight: 'sled',
    flightWindow: null,
    greatDay: false,
    sled: sledReason(hours, kind, liftAboveLaunch),
  };
}

function evaluateDay(date: string, hours: HourVerdict[], launch: LaunchProfile): DayScore {
  const goWindow = longestRun(hours, (h) => h.status === 'pass');
  const anyWindow = longestRun(hours, (h) => h.status !== 'fail');
  const goHours = windowLength(goWindow);
  const anyHours = windowLength(anyWindow);

  const verdict: DayScore['verdict'] =
    goHours >= MIN_WINDOW_HOURS
      ? 'go'
      : anyHours >= MIN_WINDOW_HOURS || goHours > 0
        ? 'marginal'
        : 'no';
  const window = verdict === 'go' ? goWindow : verdict === 'marginal' ? anyWindow : null;
  const inWindow = window ? hours.slice(window.start, window.end + 1) : [];

  // Soaring quality is judged inside the flyable window; on a day with no
  // window it is shown for the daylight hours so pilots can see what they miss.
  const daylight = hours.filter(
    (h) => !h.gates.some((g) => g.gate === 'daylight' && g.status === 'fail'),
  );
  const judged = inWindow.length > 0 ? inWindow : daylight;
  const wStars = judged.map((h) => h.conditions.wStar ?? 0);
  const peakWStar = wStars.length > 0 ? Math.max(...wStars) : 0;
  const tops = judged.map((h) => h.conditions.topOfLiftMsl).filter((v): v is number => v !== null);
  const peakTop = tops.length > 0 ? Math.max(...tops) : null;
  const heightAboveLaunch = peakTop !== null ? peakTop - launch.elevation : 0;

  let quality =
    0.45 * scoreWStar(peakWStar) +
    0.3 * scoreHeight(heightAboveLaunch) +
    0.25 * Math.min(100, (windowLength(window) / 6) * 100);

  // Hazards inside the window
  const avgOd =
    judged.length > 0
      ? judged.reduce((s, h) => s + h.conditions.odPotential, 0) / judged.length
      : 0;
  const odRisk: DayScore['odRisk'] =
    avgOd >= 2.5 ? 'high' : avgOd >= 2 ? 'moderate' : avgOd >= 1 ? 'low' : 'none';
  if (odRisk === 'high') quality -= 20;
  else if (odRisk === 'moderate') quality -= 10;

  const maxShear = Math.max(0, ...judged.map((h) => h.conditions.windShearMax ?? 0));
  const windShear: DayScore['windShear'] =
    maxShear > 40 ? 'high' : maxShear > 25 ? 'moderate' : maxShear > 15 ? 'low' : 'none';
  if (windShear === 'high') quality -= 15;
  else if (windShear === 'moderate') quality -= 8;

  const minFreezing = Math.min(
    Infinity,
    ...judged.map((h) => h.conditions.freezingLevelMsl).filter((v): v is number => v !== null),
  );
  const freezingConcern = peakTop !== null && minFreezing < peakTop + 500;

  quality = Math.max(0, Math.min(100, quality));

  // The rating answers "can I fly" first: a day with no window is Poor
  // whatever the thermals, and a marginal day tops out at Fair.
  const overallScore =
    verdict === 'go'
      ? Math.round(31 + 0.69 * quality)
      : verdict === 'marginal'
        ? Math.round(31 + 0.19 * quality)
        : Math.round(0.3 * quality);

  const flightHours = verdict === 'go' && window ? flyableStretch(hours, window) : inWindow;
  const flight = verdict === 'no' ? null : classifyFlight(flightHours, launch, odRisk);
  const goal = launch.goal ?? defaultGoal(launch.kind);
  const goalMet = meetsGoal(
    { verdict, flight: flight?.flight ?? null, greatDay: flight?.greatDay ?? false },
    goal,
  );

  const summary = summarizeReasons(hours);
  const reasons = summary.map((r) => r.text);
  const limitingFactor =
    verdict === 'go'
      ? reasons.length > 0
        ? `Outside ${formatWindow(hours, window)}: ${reasons[0]}`
        : null
      : (reasons[0] ?? 'No flyable hours');

  return {
    date,
    overallScore,
    label: scoreToLabel(overallScore),
    verdict,
    flyableWindow: formatWindow(hours, window),
    limitingFactor,
    limitingGate: summary[0]?.gate ?? null,
    reasons,
    wStar: peakWStar > 0 ? Math.round(peakWStar * 10) / 10 : null,
    bestWindow: formatWindow(hours, window) ?? undefined,
    odRisk,
    windShear,
    freezingConcern,
    peakCeilingMsl: peakTop,
    topOfLiftAboveLaunch:
      peakTop !== null && launch.elevation > 0 ? Math.round(heightAboveLaunch) : null,
    flight: flight?.flight ?? null,
    flightWindow: flight?.flightWindow ?? null,
    sled: flight?.sled ?? null,
    greatDay: flight?.greatDay ?? false,
    goalMet,
  };
}

/** Hour-by-hour verdicts for every hour in the profile. */
export function evaluateHours(profile: AtmosphericProfile, launch: LaunchProfile): HourVerdict[] {
  return profile.hours.map((hour) => {
    const conditions = deriveLaunchConditions(hour, profile.elevation, launch.elevation);
    const gates = evaluateGates(
      conditions,
      launch,
      profile.sunriseByDay?.[conditions.date],
      profile.sunsetByDay?.[conditions.date],
    );
    return {
      time: hour.time,
      hour: conditions.hour,
      status: worstStatus(gates),
      gates,
      conditions,
    };
  });
}

/** One verdict per forecast day. */
export function evaluateDays(profile: AtmosphericProfile, launch: LaunchProfile): DayScore[] {
  const byDay = new Map<string, HourVerdict[]>();
  for (const h of evaluateHours(profile, launch)) {
    const date = h.time.slice(0, 10);
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date)!.push(h);
  }
  return [...byDay.entries()].map(([date, hours]) => evaluateDay(date, hours, launch));
}
