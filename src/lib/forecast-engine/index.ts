// The forecast engine decides whether a launch is flyable, when, and how
// good it is. Every screen and alert goes through evaluateDays, so they
// cannot disagree about the same day.

import type { DayScore, Site } from '@/types';
import type { LaunchProfile } from './gates';

export { evaluateDays, evaluateHours, scoreToLabel, MIN_WINDOW_HOURS } from './evaluate';
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
  };
}

/** One plain-language sentence for a day verdict, for badges, summaries and alerts. */
export function verdictSummary(day: DayScore): string {
  if (day.verdict === 'no') {
    return `Not flyable. ${day.limitingFactor ?? 'No flyable hours'}.`;
  }
  const lift: string[] = [];
  if (day.wStar) lift.push(`thermals to about ${day.wStar.toFixed(1)} m/s`);
  if (day.topOfLiftAboveLaunch && day.topOfLiftAboveLaunch > 0) {
    lift.push(`lift to ${day.topOfLiftAboveLaunch.toLocaleString('en-US')} m above launch`);
  }
  const liftText =
    lift.length > 0 ? ` ${lift.join(', ')}.`.replace(/^ ./, (c) => c.toUpperCase()) : '';
  if (day.verdict === 'marginal') {
    return `Marginal ${day.flyableWindow ?? ''}, fly with care. ${day.limitingFactor ?? ''}.${liftText}`
      .replace(/\s+/g, ' ')
      .replace(' ,', ',');
  }
  return `Flyable ${day.flyableWindow}.${liftText}`;
}
