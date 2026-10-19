// Hard checks for one hour at a launch. Any failed gate makes the hour
// unflyable, whatever the thermals look like; a marginal gate means a
// careful pilot could still go.

import type { SiteGoal, SiteKind } from '@/types';
import type { LaunchConditions } from './launch-conditions';

export type GateStatus = 'pass' | 'marginal' | 'fail';

export type GateName =
  | 'daylight'
  | 'direction'
  | 'wind'
  | 'gusts'
  | 'rain'
  | 'cloud'
  | 'visibility'
  | 'storm';

export interface GateResult {
  gate: GateName;
  status: GateStatus;
  /** Short plain-language cause, e.g. "Wind 31 km/h (limit 25)". Absent on pass. */
  reason?: string;
}

/** What the engine needs to know about a launch. */
export interface LaunchProfile {
  elevation: number; // meters MSL, 0 when unknown
  /** Directions (degrees) the launch works well in. Empty = unknown. */
  goodDirections: number[];
  /** Directions the launch is possible in, but not ideal. */
  okDirections: number[];
  maxWindSpeed: number; // km/h
  /** What the launch can give; null or absent when unknown, so the weather decides */
  kind?: SiteKind | null;
  /** What the pilot wants from it; absent uses the default for its kind */
  goal?: SiteGoal;
}

/** Below this, a paraglider can launch facing any way. */
export const NIL_WIND_KMH = 6;
/** Half-width of the sector around each listed direction (PGE uses 8 points, 45° apart). */
export const SECTOR_HALF_WIDTH = 22.5;
/** Cloud base must clear launch by this much to launch and climb out. */
const CLOUD_CLEARANCE_M = 150;

export function angleDifference(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function compass(degrees: number): string {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(degrees / 45) % 8];
}

export function directionGate(c: LaunchConditions, launch: LaunchProfile): GateResult {
  if (c.windSpeed < NIL_WIND_KMH) return { gate: 'direction', status: 'pass' };
  if (launch.goodDirections.length === 0 && launch.okDirections.length === 0) {
    return { gate: 'direction', status: 'pass' };
  }
  const near = (dirs: number[], width: number) =>
    dirs.some((d) => angleDifference(c.windDirection, d) <= width);

  if (near(launch.goodDirections, SECTOR_HALF_WIDTH)) return { gate: 'direction', status: 'pass' };
  const reason = `${compass(c.windDirection)} wind (${c.windDirection}°)`;
  if (
    near(launch.okDirections, SECTOR_HALF_WIDTH) ||
    near(launch.goodDirections, 2 * SECTOR_HALF_WIDTH)
  ) {
    return { gate: 'direction', status: 'marginal', reason: `${reason}, cross on launch` };
  }
  return { gate: 'direction', status: 'fail', reason: `${reason}, off the launch` };
}

export function windGate(c: LaunchConditions, launch: LaunchProfile): GateResult {
  const limit = launch.maxWindSpeed;
  if (c.windSpeed > limit) {
    return { gate: 'wind', status: 'fail', reason: `Wind ${c.windSpeed} km/h (limit ${limit})` };
  }
  if (c.windSpeed > 0.8 * limit) {
    return {
      gate: 'wind',
      status: 'marginal',
      reason: `Wind ${c.windSpeed} km/h, near the ${limit} km/h limit`,
    };
  }
  return { gate: 'wind', status: 'pass' };
}

export function gustGate(c: LaunchConditions, launch: LaunchProfile): GateResult {
  const spread = c.windGust - c.windSpeed;
  if (c.windGust > launch.maxWindSpeed + 10 || spread > 25) {
    return { gate: 'gusts', status: 'fail', reason: `Gusts to ${c.windGust} km/h` };
  }
  if (c.windGust > launch.maxWindSpeed || spread > 15) {
    return { gate: 'gusts', status: 'marginal', reason: `Gusty, to ${c.windGust} km/h` };
  }
  return { gate: 'gusts', status: 'pass' };
}

export function rainGate(c: LaunchConditions): GateResult {
  if ((c.precipitation ?? 0) >= 0.3 || c.precipitationProbability >= 60) {
    return { gate: 'rain', status: 'fail', reason: rainReason(c) };
  }
  if ((c.precipitation ?? 0) > 0 || c.precipitationProbability >= 30) {
    return { gate: 'rain', status: 'marginal', reason: rainReason(c) };
  }
  return { gate: 'rain', status: 'pass' };
}

function rainReason(c: LaunchConditions): string {
  return c.precipitation && c.precipitation > 0
    ? `Rain (${c.precipitation} mm/h)`
    : `${c.precipitationProbability}% chance of rain`;
}

export function cloudGate(c: LaunchConditions, launch: LaunchProfile): GateResult {
  if (c.cloudBaseMsl === null || launch.elevation <= 0) return { gate: 'cloud', status: 'pass' };
  const clearance = c.cloudBaseMsl - launch.elevation;
  // Cloud base only caps the launch when there is cloud there to cap it.
  const cloudy = c.cloudCoverLow === null || c.cloudCoverLow >= 30;
  if (!cloudy) return { gate: 'cloud', status: 'pass' };
  if (clearance < 0) {
    return { gate: 'cloud', status: 'fail', reason: 'Launch in cloud' };
  }
  if (clearance < CLOUD_CLEARANCE_M) {
    return {
      gate: 'cloud',
      status: 'marginal',
      reason: `Cloud base only ${Math.round(clearance)} m above launch`,
    };
  }
  return { gate: 'cloud', status: 'pass' };
}

export function visibilityGate(c: LaunchConditions): GateResult {
  if (c.visibility === null) return { gate: 'visibility', status: 'pass' };
  if (c.visibility < 3000) {
    return {
      gate: 'visibility',
      status: 'fail',
      reason: `Fog, visibility ${(c.visibility / 1000).toFixed(1)} km`,
    };
  }
  if (c.visibility < 5000) {
    return {
      gate: 'visibility',
      status: 'marginal',
      reason: `Haze, visibility ${(c.visibility / 1000).toFixed(1)} km`,
    };
  }
  return { gate: 'visibility', status: 'pass' };
}

export function stormGate(c: LaunchConditions): GateResult {
  const li = c.liftedIndex;
  if ((li !== null && li <= -4) || (c.cape >= 1500 && c.precipitationProbability >= 30)) {
    return { gate: 'storm', status: 'fail', reason: 'Thunderstorms likely' };
  }
  if ((li !== null && li <= -2) || c.cape >= 1000) {
    return { gate: 'storm', status: 'marginal', reason: 'Thunderstorm risk' };
  }
  return { gate: 'storm', status: 'pass' };
}

/**
 * US Part 103 allows ultralight flight from sunrise to sunset. An hour
 * passes when it lies wholly inside that span, marginal when it overlaps it.
 */
export function daylightGate(
  c: LaunchConditions,
  sunrise: string | undefined,
  sunset: string | undefined,
): GateResult {
  if (!sunrise || !sunset) return { gate: 'daylight', status: 'pass' };
  const toHours = (iso: string) => {
    const [h, m] = iso.slice(11, 16).split(':').map(Number);
    return h + m / 60;
  };
  const rise = toHours(sunrise);
  const set = toHours(sunset);
  if (c.hour >= rise && c.hour + 1 <= set) return { gate: 'daylight', status: 'pass' };
  if (c.hour + 1 > rise && c.hour < set) {
    return {
      gate: 'daylight',
      status: 'marginal',
      reason: c.hour < rise ? 'Sunrise during the hour' : 'Sunset during the hour',
    };
  }
  return { gate: 'daylight', status: 'fail', reason: 'Dark' };
}

export function evaluateGates(
  c: LaunchConditions,
  launch: LaunchProfile,
  sunrise?: string,
  sunset?: string,
): GateResult[] {
  return [
    daylightGate(c, sunrise, sunset),
    rainGate(c),
    stormGate(c),
    cloudGate(c, launch),
    visibilityGate(c),
    windGate(c, launch),
    gustGate(c, launch),
    directionGate(c, launch),
  ];
}

export function worstStatus(results: GateResult[]): GateStatus {
  if (results.some((r) => r.status === 'fail')) return 'fail';
  if (results.some((r) => r.status === 'marginal')) return 'marginal';
  return 'pass';
}
