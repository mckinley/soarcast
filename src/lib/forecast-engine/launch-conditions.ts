// Conditions at the launch for one forecast hour, derived from an
// Open-Meteo atmospheric profile. The model reports wind 10 m above its own
// (smoothed) ground; a launch on a ridge or summit sits well above that, so
// wind and temperature are interpolated to launch altitude through the
// pressure levels.

import type { AtmosphericHour } from '@/lib/weather-profile';

export interface LaunchConditions {
  time: string; // local ISO, e.g. 2026-10-19T13:00
  date: string; // YYYY-MM-DD
  hour: number; // local hour 0-23
  windSpeed: number; // km/h at launch altitude
  windDirection: number; // degrees, where the wind comes from
  windGust: number; // km/h at launch altitude
  /**
   * The strongest wind (km/h) from launch up to the top of the lift, where
   * a pilot flies, and at least ALOFT_MIN_DEPTH_M above launch, where the
   * ridges around it are. Null when the model has no winds that high.
   */
  windAloft: number | null;
  temperature: number; // °C at launch altitude
  precipitation: number | null; // mm in the hour
  precipitationProbability: number; // %
  /**
   * The most rain (mm in an hour) and the highest chance of rain (%) from
   * this hour to two hours on. Storms build where showers do, so the storm
   * check looks a little ahead. Only this hour's when the next are unknown.
   */
  rainSoonMm: number | null;
  rainSoonChance: number;
  cloudBaseMsl: number | null; // cumulus base, meters MSL
  cloudCoverLow: number | null; // %
  visibility: number | null; // meters
  cape: number; // J/kg
  liftedIndex: number | null; // °C
  wStar: number | null; // m/s
  topOfLiftMsl: number | null; // meters MSL
  odPotential: number; // 0-3
  windShearMax: number | null; // km/h between adjacent levels
  freezingLevelMsl: number | null; // meters MSL
}

interface WindSample {
  height: number; // meters MSL
  speed: number;
  direction: number;
  temperature: number;
}

/**
 * Interpolates wind (as a vector) and temperature to a height between the
 * model's surface and its pressure levels.
 */
export function interpolateAtHeight(samples: WindSample[], height: number): WindSample {
  const sorted = [...samples].sort((a, b) => a.height - b.height);
  if (height <= sorted[0].height) return { ...sorted[0], height };
  const last = sorted[sorted.length - 1];
  if (height >= last.height) return { ...last, height };

  const upperIdx = sorted.findIndex((s) => s.height >= height);
  const lower = sorted[upperIdx - 1];
  const upper = sorted[upperIdx];
  const f = (height - lower.height) / (upper.height - lower.height);

  const toUV = (s: WindSample) => {
    const rad = (s.direction * Math.PI) / 180;
    return { u: -s.speed * Math.sin(rad), v: -s.speed * Math.cos(rad) };
  };
  const a = toUV(lower);
  const b = toUV(upper);
  const u = a.u + f * (b.u - a.u);
  const v = a.v + f * (b.v - a.v);
  const speed = Math.sqrt(u * u + v * v);
  // Back to meteorological convention: the direction the wind comes from
  const direction = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;

  return {
    height,
    speed,
    direction,
    temperature: lower.temperature + f * (upper.temperature - lower.temperature),
  };
}

/**
 * Over mountains the top of the thermals partly follows the ground: it
 * sits higher above sea level over a peak than over the valley floor, but
 * not by the peak's whole height. The model's ground is smoothed, so a
 * launch on a peak often stands hundreds of meters above it. So half the
 * launch's height above the model's ground is added to the model's top of
 * lift, up to the cloud base.
 */
export const TERRAIN_LIFT_SHARE = 0.5;

/** The model's top of lift, raised for a launch that stands above the model's ground. */
export function topOfLiftAtLaunch(
  modelTopMsl: number | null,
  modelElevation: number,
  launchElevation: number,
  cloudBaseMsl: number | null,
): number | null {
  if (modelTopMsl === null) return null;
  const above = Math.max(0, launchElevation - modelElevation);
  const raised = modelTopMsl + TERRAIN_LIFT_SHARE * above;
  return Math.round(
    cloudBaseMsl !== null ? Math.max(modelTopMsl, Math.min(raised, cloudBaseMsl)) : raised,
  );
}

/**
 * Gusts are only forecast at the model's ground. At a launch well above it,
 * the wind comes from the model's upper levels, which already runs stronger
 * than on the hill itself, so adding the whole ground-level gust on top
 * overstates the gusts there. From GUST_FADE_START_M above the model's
 * ground, less of the gust is added: half of it at GUST_FADE_FULL_M and
 * above. Checked against days pilots flew at 41 launches: the days this
 * lets through were flown about as often as Go days in the same month.
 */
/**
 * The wind higher up counts to at least this far above launch (m), lift or
 * not: about where the ridges and peaks round a mountain launch are, whose
 * lee a pilot flies in on the way down too.
 */
export const ALOFT_MIN_DEPTH_M = 500;

export const GUST_FADE_START_M = 300;
export const GUST_FADE_FULL_M = 1000;
export const GUST_FADE_SHARE = 0.5;

/** The share of the model's ground-level gust added to the wind at a launch this far above the model's ground. */
export function gustShareAtLaunch(aboveModelGround: number): number {
  if (aboveModelGround <= GUST_FADE_START_M) return 1;
  const along = (aboveModelGround - GUST_FADE_START_M) / (GUST_FADE_FULL_M - GUST_FADE_START_M);
  return Math.max(GUST_FADE_SHARE, 1 - along * (1 - GUST_FADE_SHARE));
}

/** The strongest wind between two heights, from the samples inside and both ends. */
export function strongestWindBetween(samples: WindSample[], from: number, to: number): number {
  const ends = [interpolateAtHeight(samples, from), interpolateAtHeight(samples, to)];
  return Math.max(
    ...ends.map((s) => s.speed),
    ...samples.filter((s) => s.height > from && s.height < to).map((s) => s.speed),
  );
}

/**
 * @param hour - One hour of the atmospheric profile
 * @param modelElevation - Height of the model grid cell's ground (m MSL)
 * @param launchElevation - Launch altitude (m MSL); 0 or unknown uses the model ground
 */
export function deriveLaunchConditions(
  hour: AtmosphericHour,
  modelElevation: number,
  launchElevation: number,
): LaunchConditions {
  const { surface, derived } = hour;
  const surfaceHeight = modelElevation + 10;

  // Pressure levels at or below the model's ground are extrapolated
  // values, so only levels above the surface sample are used.
  const samples: WindSample[] = [
    {
      height: surfaceHeight,
      speed: surface.windSpeed,
      direction: surface.windDirection,
      temperature: surface.temperature,
    },
    ...hour.pressureLevels
      .filter((l) => l.geopotentialHeight > surfaceHeight + 50)
      .map((l) => ({
        height: l.geopotentialHeight,
        speed: l.windSpeed,
        direction: l.windDirection,
        temperature: l.temperature,
      })),
  ];

  const atLaunch =
    launchElevation > surfaceHeight ? interpolateAtHeight(samples, launchElevation) : samples[0];

  // Gusts are only forecast at the surface; carry the surface gust spread
  // up to the launch, less of it at a launch high above the model's ground.
  const gustSpread =
    Math.max(0, surface.windGusts - surface.windSpeed) *
    gustShareAtLaunch(launchElevation - surfaceHeight);

  const cloudBaseMsl =
    derived.estimatedCloudBase !== null ? modelElevation + derived.estimatedCloudBase : null;
  const topOfLiftMsl = topOfLiftAtLaunch(
    derived.estimatedTopOfLift,
    modelElevation,
    launchElevation,
    cloudBaseMsl,
  );
  // Where a pilot flies and the ridges round the launch are: from launch to
  // the top of the lift, and at least ALOFT_MIN_DEPTH_M up, when the model
  // has winds that high
  const launchHeight = Math.max(launchElevation, surfaceHeight);
  const aloftTop = Math.max(topOfLiftMsl ?? 0, launchHeight + ALOFT_MIN_DEPTH_M);
  const windAloft = samples.some((s) => s.height >= aloftTop)
    ? Math.round(strongestWindBetween(samples, launchHeight, aloftTop))
    : null;

  return {
    time: hour.time,
    date: hour.time.slice(0, 10),
    hour: parseInt(hour.time.slice(11, 13), 10),
    windSpeed: Math.round(atLaunch.speed),
    windDirection: Math.round(atLaunch.direction),
    windGust: Math.round(atLaunch.speed + gustSpread),
    windAloft,
    temperature: Math.round(atLaunch.temperature * 10) / 10,
    precipitation: surface.precipitation ?? null,
    precipitationProbability: surface.precipitationProbability ?? 0,
    rainSoonMm: surface.precipitation ?? null,
    rainSoonChance: surface.precipitationProbability ?? 0,
    cloudBaseMsl,
    cloudCoverLow: surface.cloudCoverLow ?? null,
    visibility: surface.visibility ?? null,
    cape: surface.cape ?? 0,
    liftedIndex: surface.liftedIndex,
    wStar: derived.wStar,
    topOfLiftMsl,
    odPotential: derived.odPotential,
    windShearMax: derived.windShearMax,
    freezingLevelMsl: derived.freezingLevel,
  };
}
