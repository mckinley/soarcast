// Terrain around a launch, studied once from the Copernicus heights
// (dem.ts): which way the ground at the pin falls and how steeply, the
// wind directions that slope suits, the higher ground upwind for each wind
// direction (a launch below it sits in its lee), and the skyline all round,
// which says when the sun reaches the launch. The experiment "Terrain
// around the launch" (src/components/terrain-study.tsx) shows it. It never
// changes a verdict.
//
// The heights are of the surface the radar saw, trees and buildings
// included, so the study looks past the first stretch of ground: trees
// round a clearing would otherwise read as a wall.

import { COMPASS_POINTS } from '../site-utils';
import {
  offsetPoint,
  suggestLaunchDirections,
  type LaunchSuggestion,
  type TerrainFace,
} from '../terrain';
import { sunPosition, sunTimes, zoneFormat, zoneOffset } from '../sun-times';
import { heightAt, inGrid, readDemGrid, type DemGrid } from './dem';

/** Bump when the study changes, so stored studies are made again. */
export const TERRAIN_VERSION = 1;

/** Ground this close (m) is read at full detail (about 30 m), farther ground at half (about 60 m). */
export const NEAR_RADIUS_M = 1500;
/** How far (m) the skyline and the ground upwind are looked for. */
export const FAR_RADIUS_M = 15000;
/** The skyline's step round the compass, degrees. */
export const HORIZON_STEP_DEGREES = 5;
/** The skyline is read from this far (m): nearer ground is mostly trees round the clearing. */
export const HORIZON_FROM_M = 200;
/** The slope at the pin is fitted to the ground within this distance (m). */
export const FACE_RADIUS_M = 150;
/** Distances (m) at which each compass point's slope is read. */
export const FACE_DISTANCES = [100, 200, 300] as const;
/**
 * A launch is in the lee of higher ground upwind that is closer than this
 * many times its height above the launch: the rough air behind a ridge
 * reaches about 5 to 10 times its height downwind.
 */
export const LEE_RATIO = 8;
/** Ground less than this (m) above the launch is left out of the lee: trees and bumps. */
export const LEE_MIN_HEIGHT_M = 50;

const M_PER_DEG = 111_320;
const EARTH_RADIUS_M = 6_371_000;
/** Light and the view bend a little round the earth: the drop with distance is about 13% less. */
const REFRACTION = 0.13;

/** The highest ground upwind of a launch for one wind direction, in the lee sense. */
export interface UpwindGround {
  /** Where the wind comes from, degrees */
  direction: number;
  /** How much higher than the launch (m) and how far (m), or null when none is higher */
  height: number | null;
  distance: number | null;
  /** Whether the launch sits in that ground's lee */
  lee: boolean;
}

export interface TerrainStudy {
  version: number;
  latitude: number;
  longitude: number;
  /** The height (m) of the ground at the pin */
  ground: number;
  /** The plane fitted round the pin: the way it faces (the way the ground falls, degrees) and how steep (degrees) */
  face: { direction: number; slope: number };
  /** The slope towards each compass point (rise over run, a fall is positive) */
  faces: TerrainFace[];
  /** The wind directions that slope suits */
  suggestion: LaunchSuggestion;
  /** The skyline: how high (degrees above level) the ground stands each HORIZON_STEP_DEGREES from north */
  horizon: number[];
  /** For each compass point: the highest ground upwind */
  upwind: UpwindGround[];
}

/** Where the ground falls at the pin and how steeply, from a plane fitted to the nearby ground. */
export function fitFace(grid: DemGrid, latitude: number, longitude: number) {
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  // Sums for the least-squares plane z = a x + b y + c (x east, y north, meters)
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sxz = 0;
  let syz = 0;
  for (let r = 0; r < grid.rows; r++) {
    const y = (grid.north - r * grid.dLat - latitude) * M_PER_DEG;
    if (Math.abs(y) > FACE_RADIUS_M) continue;
    for (let c = 0; c < grid.cols; c++) {
      const x = (grid.west + c * grid.dLon - longitude) * M_PER_DEG * cosLat;
      if (x * x + y * y > FACE_RADIUS_M ** 2) continue;
      const z = grid.z[r * grid.cols + c];
      n++;
      sx += x;
      sy += y;
      sz += z;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      sxz += x * z;
      syz += y * z;
    }
  }
  // Centered, the plane's tilt solves a 2 by 2 system
  const cxx = sxx - (sx * sx) / n;
  const cyy = syy - (sy * sy) / n;
  const cxy = sxy - (sx * sy) / n;
  const cxz = sxz - (sx * sz) / n;
  const cyz = syz - (sy * sz) / n;
  const det = cxx * cyy - cxy * cxy;
  const a = det ? (cxz * cyy - cyz * cxy) / det : 0;
  const b = det ? (cyz * cxx - cxz * cxy) / det : 0;
  const direction = ((Math.atan2(-a, -b) * 180) / Math.PI + 360) % 360;
  const slope = (Math.atan(Math.hypot(a, b)) * 180) / Math.PI;
  return { direction: Math.round(direction), slope: Math.round(slope * 10) / 10 };
}

/** The ground height at a place from the finer grid where it reaches, else the coarser. */
function groundAt(near: DemGrid, far: DemGrid, latitude: number, longitude: number): number {
  return inGrid(near, latitude, longitude)
    ? heightAt(near, latitude, longitude)
    : heightAt(far, latitude, longitude);
}

/** The distances (m) read along each bearing: every 30 m near the launch, every 60 m beyond. */
function distances(from: number): number[] {
  const out: number[] = [];
  for (let d = from; d <= NEAR_RADIUS_M; d += 30) out.push(d);
  for (let d = Math.max(from, NEAR_RADIUS_M + 60); d <= FAR_RADIUS_M; d += 60) out.push(d);
  return out;
}

/** The whole study from the two grids round the pin. */
export function studyFromGrids(
  near: DemGrid,
  far: DemGrid,
  latitude: number,
  longitude: number,
): TerrainStudy {
  const ground = heightAt(near, latitude, longitude);
  const faces: TerrainFace[] = COMPASS_POINTS.map(({ degrees }) => {
    const slopes = FACE_DISTANCES.map((d) => {
      const p = offsetPoint(latitude, longitude, degrees, d);
      return (ground - heightAt(near, p.latitude, p.longitude)) / d;
    });
    return { direction: degrees, slope: Math.round(Math.min(...slopes) * 1000) / 1000 };
  });

  // Along each bearing: the highest the ground stands above level (the
  // skyline) and the ground most likely to put the launch in its lee
  const steps = 360 / HORIZON_STEP_DEGREES;
  const horizon: number[] = [];
  const leeOf: Array<{ height: number; distance: number; ratio: number } | null> = [];
  const along = distances(100);
  for (let i = 0; i < steps; i++) {
    const bearing = i * HORIZON_STEP_DEGREES;
    let top = -90;
    let lee: { height: number; distance: number; ratio: number } | null = null;
    for (const d of along) {
      const p = offsetPoint(latitude, longitude, bearing, d);
      const drop = ((d * d) / (2 * EARTH_RADIUS_M)) * (1 - REFRACTION);
      const height = groundAt(near, far, p.latitude, p.longitude) - ground - drop;
      if (d >= HORIZON_FROM_M) top = Math.max(top, (Math.atan2(height, d) * 180) / Math.PI);
      if (height >= LEE_MIN_HEIGHT_M && (!lee || height / d > lee.ratio)) {
        lee = { height, distance: d, ratio: height / d };
      }
    }
    horizon.push(Math.round(top * 10) / 10);
    leeOf.push(lee);
  }

  // For each compass point, the bearings within half a point either side
  const upwind: UpwindGround[] = COMPASS_POINTS.map(({ degrees }) => {
    let best: { height: number; distance: number; ratio: number } | null = null;
    for (let off = -20; off <= 20; off += HORIZON_STEP_DEGREES) {
      const i = ((((degrees + off) % 360) + 360) % 360) / HORIZON_STEP_DEGREES;
      const lee = leeOf[i];
      if (lee && (!best || lee.ratio > best.ratio)) best = lee;
    }
    return {
      direction: degrees,
      height: best ? Math.round(best.height) : null,
      distance: best ? Math.round(best.distance / 10) * 10 : null,
      lee: best != null && best.distance <= LEE_RATIO * best.height,
    };
  });

  return {
    version: TERRAIN_VERSION,
    latitude,
    longitude,
    ground: Math.round(ground),
    face: fitFace(near, latitude, longitude),
    faces,
    suggestion: suggestLaunchDirections(faces),
    horizon,
    upwind,
  };
}

/** Study the terrain round a pin, reading the heights from Amazon. */
export async function studyTerrain(
  latitude: number,
  longitude: number,
  fetcher: typeof fetch = fetch,
): Promise<TerrainStudy> {
  const near = await readDemGrid(latitude, longitude, NEAR_RADIUS_M + 100, 0, fetcher);
  const far = await readDemGrid(latitude, longitude, FAR_RADIUS_M + 200, 1, fetcher);
  return studyFromGrids(near, far, latitude, longitude);
}

/** How high the skyline stands (degrees) towards a bearing, between its two nearest steps. */
export function skylineAt(horizon: number[], bearing: number): number {
  const x = ((((bearing % 360) + 360) % 360) / 360) * horizon.length;
  const i = Math.floor(x) % horizon.length;
  const f = x - Math.floor(x);
  return horizon[i] * (1 - f) + horizon[(i + 1) % horizon.length] * f;
}

/** How square the sun shines onto the slope: 1 straight on, 0 or less along it or behind. */
export function sunOnSlope(
  sun: { elevation: number; azimuth: number },
  face: { direction: number; slope: number },
): number {
  const rad = Math.PI / 180;
  return (
    Math.sin(sun.elevation * rad) * Math.cos(face.slope * rad) +
    Math.cos(sun.elevation * rad) *
      Math.sin(face.slope * rad) *
      Math.cos((sun.azimuth - face.direction) * rad)
  );
}

/** Minutes between the times the sun is checked on the launch. */
export const SUN_STEP_MINUTES = 5;
/** Sun that grazes the slope doesn't count: it must stand about 6° over the slope's plane. */
const SUN_MIN_ON_SLOPE = 0.1;

export interface SunOnLaunch {
  /** Local times ("09:40") the sun first and last shines on the launch, null when it never does */
  first: string | null;
  last: string | null;
  /** Hours of sun on the launch */
  hours: number;
}

/**
 * When the sun shines on the launch on a local date: above the skyline and
 * onto the slope rather than along or behind it.
 */
export function sunOnLaunch(
  study: Pick<TerrainStudy, 'latitude' | 'longitude' | 'face' | 'horizon'>,
  date: string,
  timeZone: string,
): SunOnLaunch {
  const times = sunTimes(date, study.latitude, study.longitude);
  const fmt = zoneFormat(timeZone);
  const offset = zoneOffset(fmt, Date.parse(`${date}T12:00:00Z`));
  // Polar day or night: check the whole day
  const [from, to] = times ?? [
    Date.parse(`${date}T00:00:00Z`) - offset,
    Date.parse(`${date}T23:59:00Z`) - offset,
  ];
  let first: number | null = null;
  let last: number | null = null;
  let lit = 0;
  for (let t = from; t <= to; t += SUN_STEP_MINUTES * 60_000) {
    const sun = sunPosition(study.latitude, study.longitude, t);
    if (sun.elevation <= skylineAt(study.horizon, sun.azimuth)) continue;
    if (sunOnSlope(sun, study.face) < SUN_MIN_ON_SLOPE) continue;
    first ??= t;
    last = t;
    lit++;
  }
  const clock = (t: number) => new Date(t + offset).toISOString().slice(11, 16);
  return {
    first: first == null ? null : clock(first),
    last: last == null ? null : clock(last),
    hours: Math.round((lit * SUN_STEP_MINUTES) / 6) / 10,
  };
}

/** A slope gentler than this (degrees) says little about which way a launch faces. */
export const FLAT_SLOPE_DEGREES = 8;
/** The slope fits a listed wind direction within this many degrees of it. */
export const FITS_DEGREES = 45;

/** Whether the slope faces within FITS_DEGREES of any of the directions. */
export function faceFits(face: TerrainStudy['face'], directions: number[]): boolean {
  return directions.some((d) => {
    const diff = Math.abs(face.direction - d) % 360;
    return Math.min(diff, 360 - diff) <= FITS_DEGREES;
  });
}

/** What a site page shows: the study, and the sun on the launch today and on the 15th of each month. */
export interface TerrainView {
  study: TerrainStudy;
  today: SunOnLaunch | null;
  months: SunOnLaunch[] | null;
}

export type TerrainExperiment = { view: TerrainView; why: null } | { view: null; why: 'failed' };

export function terrainView(
  study: TerrainStudy,
  today: string | null,
  timeZone: string | null,
): TerrainView {
  if (!today || !timeZone) return { study, today: null, months: null };
  const year = today.slice(0, 4);
  return {
    study,
    today: sunOnLaunch(study, today, timeZone),
    months: Array.from({ length: 12 }, (_, m) =>
      sunOnLaunch(study, `${year}-${String(m + 1).padStart(2, '0')}-15`, timeZone),
    ),
  };
}
