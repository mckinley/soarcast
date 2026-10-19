// Launch elevation and a suggested launch direction from terrain data, for
// a site a pilot pins on the map. Open-Meteo's elevation API serves the
// Copernicus 90 m elevation model, free and without a key.

import { COMPASS_POINTS } from '@/lib/site-utils';

const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

/** Distances (m) from the pin at which each face is sampled. */
export const SAMPLE_DISTANCES = [150, 300] as const;

/** A face steeper than this (rise over run, about 17°) can work well as a launch. */
const GOOD_SLOPE = 0.3;
/** A face steeper than this (about 10°) may work, cross or in stronger wind. */
const OK_SLOPE = 0.18;

export interface TerrainFace {
  direction: number; // degrees the ground falls away towards
  slope: number; // average gradient away from the pin; negative = rises
}

export interface LaunchSuggestion {
  good: number[];
  ok: number[];
}

/** The point `distance` meters from (latitude, longitude) along `bearing` degrees. */
export function offsetPoint(
  latitude: number,
  longitude: number,
  bearing: number,
  distance: number,
): { latitude: number; longitude: number } {
  const rad = (bearing * Math.PI) / 180;
  const metersPerDegree = 111_320;
  return {
    latitude: latitude + (distance * Math.cos(rad)) / metersPerDegree,
    longitude:
      longitude +
      (distance * Math.sin(rad)) / (metersPerDegree * Math.cos((latitude * Math.PI) / 180)),
  };
}

/**
 * The pin, then for each compass point (clockwise from north) one point per
 * SAMPLE_DISTANCES entry.
 */
export function samplePoints(
  latitude: number,
  longitude: number,
): Array<{ latitude: number; longitude: number }> {
  return [
    { latitude, longitude },
    ...COMPASS_POINTS.flatMap(({ degrees }) =>
      SAMPLE_DISTANCES.map((d) => offsetPoint(latitude, longitude, degrees, d)),
    ),
  ];
}

/**
 * Slope of the ground away from the pin towards each compass point, from
 * elevations in samplePoints order. A face counts only as steep as its
 * gentler stretch, so ground that drops and then rises again (a saddle or
 * a bench) doesn't look like a launch.
 */
export function terrainFaces(elevations: number[]): TerrainFace[] {
  const [center] = elevations;
  return COMPASS_POINTS.map(({ degrees }, i) => {
    const slopes = SAMPLE_DISTANCES.map(
      (d, j) => (center - elevations[1 + i * SAMPLE_DISTANCES.length + j]) / d,
    );
    return { direction: degrees, slope: Math.min(...slopes) };
  });
}

/**
 * Wind directions a launch at the pin probably works in: a slope works in
 * wind blowing up it, which comes from the direction the slope faces. The
 * steepest faces are suggested as good, gentler ones as possible.
 */
export function suggestLaunchDirections(faces: TerrainFace[]): LaunchSuggestion {
  const steepest = Math.max(...faces.map((f) => f.slope));
  const good = faces
    .filter((f) => f.slope >= Math.max(GOOD_SLOPE, 0.75 * steepest))
    .map((f) => f.direction);
  const ok = faces
    .filter((f) => !good.includes(f.direction) && f.slope >= Math.max(OK_SLOPE, 0.5 * steepest))
    .map((f) => f.direction);
  return { good, ok };
}

/** Terrain elevations (m) for up to 100 points. */
export async function fetchElevations(
  points: Array<{ latitude: number; longitude: number }>,
): Promise<number[]> {
  const url = new URL(ELEVATION_URL);
  url.searchParams.set('latitude', points.map((p) => p.latitude.toFixed(5)).join(','));
  url.searchParams.set('longitude', points.map((p) => p.longitude.toFixed(5)).join(','));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open-Meteo elevation answered ${response.status}`);
  const body = (await response.json()) as { elevation?: number[] };
  if (!Array.isArray(body.elevation) || body.elevation.length !== points.length) {
    throw new Error('Open-Meteo elevation returned no data');
  }
  return body.elevation;
}

export interface TerrainReport {
  elevation: number; // meters at the pin
  faces: TerrainFace[];
  suggestion: LaunchSuggestion;
}

export async function analyzeTerrain(latitude: number, longitude: number): Promise<TerrainReport> {
  const elevations = await fetchElevations(samplePoints(latitude, longitude));
  const faces = terrainFaces(elevations);
  return {
    elevation: Math.round(elevations[0]),
    faces,
    suggestion: suggestLaunchDirections(faces),
  };
}
