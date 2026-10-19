// Day verdicts for a launch: gates hour by hour, then the longest flyable
// window, then how good the soaring is inside it, then hazards. This is the
// one place SoarCast decides whether a day is flyable.

import type { AtmosphericProfile } from '@/lib/weather-profile';
import type { DayScore } from '@/types';
import { deriveLaunchConditions, type LaunchConditions } from './launch-conditions';
import {
  evaluateGates,
  worstStatus,
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

function windowLength(w: Window | null): number {
  return w ? w.end - w.start + 1 : 0;
}

function formatWindow(hours: HourVerdict[], w: Window | null): string | null {
  if (!w) return null;
  const pad = (n: number) => `${String(n).padStart(2, '0')}:00`;
  return `${pad(hours[w.start].hour)}-${pad(hours[w.end].hour + 1)}`;
}

function formatHours(hours: number[]): string {
  const pad = (n: number) => `${String(n).padStart(2, '0')}:00`;
  return `${pad(hours[0])}-${pad(hours[hours.length - 1] + 1)}`;
}

/**
 * Groups the non-passing gate results of daylight hours into reasons with
 * their time span, most frequent first: "Wind 31 km/h (limit 25), 13:00-17:00".
 */
function summarizeReasons(hours: HourVerdict[]): string[] {
  const byGate = new Map<string, { hours: number[]; reasons: string[]; fail: boolean }>();
  for (const h of hours) {
    if (h.gates.some((g) => g.gate === 'daylight' && g.status === 'fail')) continue;
    for (const g of h.gates) {
      if (g.status === 'pass' || g.gate === 'daylight') continue;
      const entry = byGate.get(g.gate) ?? { hours: [], reasons: [], fail: false };
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
      return `${reason}, ${formatHours(e.hours)}`;
    });
}

function scoreWStar(wStar: number): number {
  // 0 -> 0, 1 m/s -> 35, 2 m/s -> 70, 3+ m/s -> 100
  if (wStar <= 0) return 0;
  if (wStar >= 3) return 100;
  return wStar <= 2 ? wStar * 35 : 70 + (wStar - 2) * 30;
}

function scoreHeight(metersAboveLaunch: number): number {
  // Under 300 m above launch is a sled ride; 1,500 m+ is plenty
  return Math.max(0, Math.min(100, ((metersAboveLaunch - 300) / 1200) * 100));
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

  const reasons = summarizeReasons(hours);
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
    reasons,
    wStar: peakWStar > 0 ? Math.round(peakWStar * 10) / 10 : null,
    bestWindow: formatWindow(hours, window) ?? undefined,
    odRisk,
    windShear,
    freezingConcern,
    peakCeilingMsl: peakTop,
    topOfLiftAboveLaunch:
      peakTop !== null && launch.elevation > 0 ? Math.round(heightAboveLaunch) : null,
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
