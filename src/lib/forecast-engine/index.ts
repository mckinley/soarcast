// The forecast engine decides whether a launch is flyable, when, and how
// good it is. Every screen and alert goes through evaluateDays, so they
// cannot disagree about the same day.

import type { DayScore, Site } from '@/types';
import type { LaunchProfile } from './gates';

export {
  evaluateDays,
  evaluateHours,
  scoreToLabel,
  MIN_WINDOW_HOURS,
  RIDGE_MIN_KMH,
  SOAR_MIN_HEIGHT,
  THERMAL_MIN_WSTAR,
} from './evaluate';
export type { HourVerdict } from './evaluate';
export type { LaunchProfile, GateResult, GateStatus, GateName } from './gates';
export type { LaunchConditions } from './launch-conditions';

/** Paraglider launch limit used when a site has none: most launches top out around 25 km/h. */
export const DEFAULT_MAX_WIND_KMH = 25;

export function launchProfileFromSite(site: Site): LaunchProfile {
  return {
    elevation: site.elevation > 0 ? site.elevation : 0,
    goodDirections: site.idealWindDirections ?? [],
    okDirections: site.okWindDirections ?? [],
    maxWindSpeed: site.maxWindSpeed > 0 ? site.maxWindSpeed : DEFAULT_MAX_WIND_KMH,
    kind: site.kind ?? null,
    goal: site.goal,
  };
}

/** The flight a day gives, in words: "thermals 12:00-16:00 climbing about 1.8 m/s ...". */
export function flightSummary(day: DayScore): string | null {
  const climb = day.wStar ? ` climbing about ${day.wStar.toFixed(1)} m/s` : '';
  const height =
    day.topOfLiftAboveLaunch && day.topOfLiftAboveLaunch > 0
      ? ` to ${day.topOfLiftAboveLaunch.toLocaleString('en-US')} m above launch`
      : '';
  switch (day.flight) {
    case 'xc':
      return `an XC day, thermals ${day.flightWindow}${climb}${height}`;
    case 'thermal':
      return `thermals ${day.flightWindow}${climb}${height}`;
    case 'ridge':
      return `ridge soaring ${day.flightWindow} in wind onto the launch`;
    case 'sled': {
      const why = day.sled && sledReasonText(day.sled, (m) => `${m.toLocaleString('en-US')} m`);
      return why ? `a sled ride, ${why}` : 'a sled ride';
    }
    default:
      return null;
  }
}

/**
 * Why a day is only a sled ride, in a few words: "thermals top out 120 m
 * above launch"; null at a sled-only site. `height` writes a height in the
 * reader's units.
 */
export function sledReasonText(
  sled: NonNullable<DayScore['sled']>,
  height: (meters: number) => string,
): string | null {
  switch (sled.reason) {
    case 'sled-site':
      return null; // the pilot or the listing said so
    case 'ridge-wind':
      return 'not enough wind onto the ridge to soar';
    case 'weak':
      return 'thermals too weak to climb';
    case 'below-launch':
      return 'thermals top out below launch';
    case 'low':
      return `thermals top out ${height(sled.liftAboveLaunch ?? 0)} above launch`;
    case 'short':
      return 'lift too short-lived to stay up';
  }
}

/** One plain-language sentence for a day verdict, for badges, summaries and alerts. */
export function verdictSummary(day: DayScore): string {
  if (day.verdict === 'no') {
    return `Not flyable. ${day.limitingFactor ?? 'No flyable hours'}.`;
  }
  const flight = flightSummary(day);
  if (day.verdict === 'marginal') {
    const flightText = flight ? ` ${flight[0].toUpperCase()}${flight.slice(1)}.` : '';
    return `Marginal ${day.flyableWindow ?? ''}, fly with care. ${day.limitingFactor ?? ''}.${flightText}`
      .replace(/\s+/g, ' ')
      .replace(' ,', ',');
  }
  // "Launch window", not "Flyable": screens say Flyable for a day below the pilot's goal
  return `Launch window ${day.flyableWindow}${flight ? `: ${flight}` : ''}.`;
}
