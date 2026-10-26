// The numbers behind a day's word on a site page: the wind on launch, the
// wind higher up, cloud base, rain and the freezing level, over the hours
// that count. Thermals and the top of lift come from the day's rating.

import type { AtmosphericProfile } from '@/lib/weather-profile';
import { deriveLaunchConditions } from '@/lib/forecast-engine/launch-conditions';
import { calculateCircularMean } from '@/lib/site-utils';
import { compassPoint } from '@/components/windgram/wind-barb-utils';

export interface DayNumbers {
  /** Average wind on launch (km/h) and where it comes from ("WSW") */
  launchWind: number;
  launchDirection: string;
  /** The strongest gust on launch (km/h) */
  launchGust: number;
  /** Average wind at 850 hPa, about 1,500 m up (km/h), and where it comes from */
  upperWind: number;
  upperDirection: string;
  /** Average cumulus base (m above sea level), null when no cumulus forms */
  cloudBaseMsl: number | null;
  /** The highest chance of rain in any of the hours (%) */
  rainChance: number;
  /** Average height where it freezes (m above sea level) */
  freezingLevelMsl: number | null;
}

const hourOf = (time: string) => parseInt(time.slice(11, 13), 10);

/** The flyable window's hours, or the day's daylight hours when there is none. */
export function hoursToDescribe(
  profile: AtmosphericProfile,
  date: string,
  window: string | null,
): AtmosphericProfile['hours'] {
  const dayHours = profile.hours.filter((h) => h.time.startsWith(date));
  if (window) {
    const [start, end] = window.split('-').map((t) => parseInt(t, 10));
    return dayHours.filter((h) => hourOf(h.time) >= start && hourOf(h.time) < end);
  }
  const sunrise = profile.sunriseByDay?.[date];
  const sunset = profile.sunsetByDay?.[date];
  const first = sunrise ? hourOf(sunrise) : 6;
  const last = sunset ? hourOf(sunset) : 20;
  return dayHours.filter((h) => hourOf(h.time) >= first && hourOf(h.time) <= last);
}

const average = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

/** The day's numbers over its flyable window (or daylight). Null when the profile has no hours for it. */
export function dayNumbers(
  profile: AtmosphericProfile,
  date: string,
  window: string | null,
  launchElevation = 0,
): DayNumbers | null {
  const hours = hoursToDescribe(profile, date, window);
  if (hours.length === 0) return null;

  const atLaunch = hours.map((h) => deriveLaunchConditions(h, profile.elevation, launchElevation));
  const upper = hours
    .map((h) => h.pressureLevels.find((l) => l.pressure === 850))
    .filter((l) => l != null);
  const cloudBases = atLaunch.map((c) => c.cloudBaseMsl).filter((v): v is number => v !== null);
  const freezing = atLaunch.map((c) => c.freezingLevelMsl).filter((v): v is number => v !== null);
  const round = (v: number | null) => (v === null ? null : Math.round(v));

  return {
    launchWind: Math.round(average(atLaunch.map((c) => c.windSpeed)) ?? 0),
    launchDirection: compassPoint(calculateCircularMean(atLaunch.map((c) => c.windDirection))),
    launchGust: Math.max(...atLaunch.map((c) => c.windGust)),
    upperWind: Math.round(average(upper.map((l) => l.windSpeed)) ?? 0),
    upperDirection: compassPoint(calculateCircularMean(upper.map((l) => l.windDirection))),
    cloudBaseMsl: round(average(cloudBases)),
    rainChance: Math.max(0, ...atLaunch.map((c) => c.precipitationProbability)),
    freezingLevelMsl: round(average(freezing)),
  };
}

/** How strong thermals of `wStar` m/s are, in a word or two. */
export function thermalWord(wStar: number | null | undefined): string {
  if (wStar == null || wStar < 0.5) return 'Too weak to climb';
  if (wStar < 1.2) return 'Weak';
  if (wStar < 2) return 'Moderate';
  if (wStar < 3) return 'Strong';
  return 'Very strong';
}

/** How strong the wind higher up is, in a word. */
export function upperWindWord(kmh: number): string {
  if (kmh < 35) return 'Light';
  if (kmh < 65) return 'Moderate';
  if (kmh < 90) return 'Strong';
  return 'Very strong';
}

/** How likely rain is, in a word or two. */
export function rainWord(chance: number): string {
  if (chance <= 10) return 'Very low';
  if (chance <= 30) return 'Low';
  if (chance <= 50) return 'Moderate';
  return 'High';
}

/** "Low", "Moderate", "None" for a hazard level. */
export function riskWord(risk: string | undefined): string {
  if (!risk || risk === 'none') return 'None';
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

/** Meters to feet, rounded. */
export function feet(meters: number): number {
  return Math.round(meters * 3.28084);
}
