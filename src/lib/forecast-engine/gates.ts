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

/** Thermals a paraglider can climb in: about its own sink rate. */
export const THERMAL_MIN_WSTAR = 1.0; // m/s
/** Below this, a paraglider can launch facing any way. */
export const NIL_WIND_KMH = 6;
/** Half-width of the sector around each listed direction (PGE uses 8 points, 45° apart). */
export const SECTOR_HALF_WIDTH = 22.5;
/** Below this, in an hour with thermals, wind a little across the launch is no trouble. */
export const LIGHT_CROSS_KMH = 12;
/** Wind over this share of the limit makes an hour marginal. */
export const WIND_NEAR_LIMIT = 0.8;
/** Gusts this far over the wind limit fail the hour. */
export const GUST_OVER_LIMIT_KMH = 10;
/** Without thermals, gusts this far over the mean wind fail the hour, or make it marginal. */
export const GUST_SPREAD_FAIL_KMH = 25;
export const GUST_SPREAD_MARGINAL_KMH = 15;
/** Rain in the hour (mm) or a chance of rain (%) that fails it; a lower chance makes it marginal. */
export const RAIN_FAIL_MM = 0.3;
export const RAIN_FAIL_CHANCE = 60;
export const RAIN_MARGINAL_CHANCE = 30;
/** Cloud base must clear launch by this much to launch and climb out. */
export const CLOUD_CLEARANCE_M = 150;
/** Low cloud cover (%) it takes for cloud base to cap the launch. */
export const LOW_CLOUD_COVER = 30;
/** Visibility (m) under which an hour is foggy, or hazy. */
export const FOG_VISIBILITY_M = 3000;
export const HAZE_VISIBILITY_M = 5000;

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
    // Thermals bring the wind up the slope, so a light cross wind is no trouble then
    if (c.windSpeed < LIGHT_CROSS_KMH && (c.wStar ?? 0) >= THERMAL_MIN_WSTAR) {
      return { gate: 'direction', status: 'pass' };
    }
    return { gate: 'direction', status: 'marginal', reason: `${reason}, cross on launch` };
  }
  return { gate: 'direction', status: 'fail', reason: `${reason}, off the launch` };
}

export function windGate(c: LaunchConditions, launch: LaunchProfile): GateResult {
  const limit = launch.maxWindSpeed;
  if (c.windSpeed > limit) {
    return { gate: 'wind', status: 'fail', reason: `Wind ${c.windSpeed} km/h (limit ${limit})` };
  }
  if (c.windSpeed > WIND_NEAR_LIMIT * limit) {
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
  // In an hour with climbable thermals the model's gusts are mostly the
  // thermals themselves, which pilots fly in: only how strong the gusts get
  // counts then, not how far they run over the mean wind.
  const thermic = (c.wStar ?? 0) >= THERMAL_MIN_WSTAR;
  if (
    c.windGust > launch.maxWindSpeed + GUST_OVER_LIMIT_KMH ||
    (!thermic && spread > GUST_SPREAD_FAIL_KMH)
  ) {
    return { gate: 'gusts', status: 'fail', reason: `Gusts to ${c.windGust} km/h` };
  }
  if (c.windGust > launch.maxWindSpeed || (!thermic && spread > GUST_SPREAD_MARGINAL_KMH)) {
    return { gate: 'gusts', status: 'marginal', reason: `Gusty, to ${c.windGust} km/h` };
  }
  return { gate: 'gusts', status: 'pass' };
}

/**
 * How far the model's rain can be taken at its word. Global models rain a
 * little on most days in the tropics, and little of it falls: at Colombian
 * and Thai airports in 2024-26, the model SoarCast uses forecast rain in
 * the flying hours on 84 to 95% of dry-season days, the airports saw some
 * on 3 to 33%, and even an hour forecast at 3 mm/h saw rain within an hour
 * either side only a quarter to a third of the time, in the rainy seasons
 * too. In Washington forecast rain came true on three days in four.
 */
export type RainTrust = 'trusted' | 'low';

export const TROPICS_LATITUDE = 23.5;
/** Where model rain is little trusted, this much in an hour still makes a shower worth watching for. */
export const SHOWER_MM = 3;

export function rainTrust(latitude: number): RainTrust {
  return Math.abs(latitude) < TROPICS_LATITUDE ? 'low' : 'trusted';
}

export function rainGate(c: LaunchConditions, trust: RainTrust = 'trusted'): GateResult {
  if (trust === 'low') {
    // Light model rain and the chance of rain say little here
    if ((c.precipitation ?? 0) >= SHOWER_MM) {
      return {
        gate: 'rain',
        status: 'marginal',
        reason: `Showers possible (${c.precipitation} mm/h)`,
      };
    }
    return { gate: 'rain', status: 'pass' };
  }
  if ((c.precipitation ?? 0) >= RAIN_FAIL_MM || c.precipitationProbability >= RAIN_FAIL_CHANCE) {
    return { gate: 'rain', status: 'fail', reason: rainReason(c) };
  }
  if ((c.precipitation ?? 0) > 0 || c.precipitationProbability >= RAIN_MARGINAL_CHANCE) {
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
  const cloudy = c.cloudCoverLow === null || c.cloudCoverLow >= LOW_CLOUD_COVER;
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
  if (c.visibility < FOG_VISIBILITY_M) {
    return {
      gate: 'visibility',
      status: 'fail',
      reason: `Fog, visibility ${(c.visibility / 1000).toFixed(1)} km`,
    };
  }
  if (c.visibility < HAZE_VISIBILITY_M) {
    return {
      gate: 'visibility',
      status: 'marginal',
      reason: `Haze, visibility ${(c.visibility / 1000).toFixed(1)} km`,
    };
  }
  return { gate: 'visibility', status: 'pass' };
}

/** Unstable air: thermals can grow into storms. */
export const STORM_RISK_LI = -2;
export const STORM_RISK_CAPE = 1000; // J/kg
/** Very unstable air. */
export const STORM_SEVERE_LI = -4;
export const STORM_SEVERE_CAPE = 1500; // J/kg
/** Showers this many hours ahead count for the storm check. */
export const RAIN_SOON_HOURS = 2;

/**
 * Storms need unstable air and something to set them off. The model's
 * showers say where it sets them off, so unstable air counts fully only
 * with showers in the hour or the two after it, as far as the model's rain
 * can be trusted there. Without showers, very unstable air still makes the
 * hour marginal, and plain unstable air passes. At 42 well-flown launches
 * over two years, pilots flew the days this let through as often as Go
 * days in the same month.
 */
export function stormGate(c: LaunchConditions, trust: RainTrust = 'trusted'): GateResult {
  const li = c.liftedIndex;
  const unstable = (li !== null && li <= STORM_RISK_LI) || c.cape >= STORM_RISK_CAPE;
  if (!unstable) return { gate: 'storm', status: 'pass' };
  const severe = (li !== null && li <= STORM_SEVERE_LI) || c.cape >= STORM_SEVERE_CAPE;
  const showersSoon =
    trust === 'low'
      ? (c.rainSoonMm ?? 0) >= RAIN_FAIL_MM
      : (c.rainSoonMm ?? 0) > 0 || c.rainSoonChance >= RAIN_MARGINAL_CHANCE;
  if (showersSoon) {
    return severe
      ? { gate: 'storm', status: 'fail', reason: 'Thunderstorms likely' }
      : { gate: 'storm', status: 'marginal', reason: 'Thunderstorm risk' };
  }
  if (severe) {
    return { gate: 'storm', status: 'marginal', reason: 'Very unstable air, storms can build' };
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
  trust: RainTrust = 'trusted',
): GateResult[] {
  return [
    daylightGate(c, sunrise, sunset),
    rainGate(c, trust),
    stormGate(c, trust),
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
