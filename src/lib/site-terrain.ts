// Whether a launch is in big mountains, from the ground within
// TERRAIN_RADIUS_M of it: how steep it is on average and how much height it
// spans. In big mountains the forecast engine uses a lower wind limit,
// counts the wind higher up and gives storms a wider margin (gates.ts).
//
// pgsites measures every listed site the same way and serves the two
// numbers as terrain_slope and terrain_relief (app/lib/terrain.ts in
// mckinley/paragliding-sites); private sites are measured here when saved.
// Change the measure in both.
//
// The rule was set on about 100 launches. Big mountains: Mailbox Peak and
// Mt Si (14 to 16 degrees over about 1,200 m), Stevens Pass, Jackson Hole,
// Sun Valley, Annecy, Chamonix, the Swiss and Austrian launches, Bir (17 to
// 25 degrees over 1,000 to 3,400 m), Owens Valley (10 degrees over 2,300 m).
// Not: Tiger Mountain (5 degrees over 560 m), Chelan Butte (9 over 860),
// Blanchard (5 over 660), Woodrat (12 over 860), Valle de Bravo (9 over
// 1,300), Point of the Mountain (7 over 1,300), Torrey Pines (2 over 210).

import type { SiteTerrain } from '@/types';
import { readDemGrid, type DemGrid } from './terrain-study/dem';

export const SITE_TERRAINS: SiteTerrain[] = ['mountains', 'hills'];

export const TERRAIN_LABEL: Record<SiteTerrain, string> = {
  mountains: 'Big mountains',
  hills: 'Hills and plains',
};

/** How far round the launch the ground is measured (m): about where a local flight goes. */
export const TERRAIN_RADIUS_M = 20_000;
/** The heights' level of detail: 3 is an eighth of full detail, about 240 m. */
export const TERRAIN_LEVEL = 3;
/** Big mountains: ground this steep on average (degrees)... */
export const MOUNTAIN_SLOPE_DEGREES = 11;
/** ...that spans at least this much height (m). Rough hills are steep too, but low. */
export const MOUNTAIN_RELIEF_M = 900;
/** Ground that spans this much height (m) is big mountains however wide its valley floors. */
export const BIG_RELIEF_M = 2000;

export function isSiteTerrain(value: unknown): value is SiteTerrain {
  return typeof value === 'string' && (SITE_TERRAINS as string[]).includes(value);
}

export interface TerrainMeasure {
  /** The ground's average steepness within the radius, degrees, at the level's detail */
  slope: number;
  /** The height it spans (m): its 95th percentile less its 5th, so one spike or pit doesn't count */
  relief: number;
}

/** The terrain a measure says; null when there is none yet. */
export function terrainFromMeasure(
  slope: number | null | undefined,
  relief: number | null | undefined,
): SiteTerrain | null {
  if (slope == null || relief == null) return null;
  return (slope >= MOUNTAIN_SLOPE_DEGREES && relief >= MOUNTAIN_RELIEF_M) || relief >= BIG_RELIEF_M
    ? 'mountains'
    : 'hills';
}

/** The terrain a site is rated with: the pilot's choice, else the measured one. */
export function siteTerrain(
  chosen: string | null | undefined,
  slope: number | null | undefined,
  relief: number | null | undefined,
): SiteTerrain | null {
  return isSiteTerrain(chosen) ? chosen : terrainFromMeasure(slope, relief);
}

const M_PER_DEG = 111_320;

/** The measure from a grid that reaches at least one cell past the radius. */
export function measureTerrain(
  grid: DemGrid,
  latitude: number,
  longitude: number,
  radiusM = TERRAIN_RADIUS_M,
): TerrainMeasure {
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  const dy = grid.dLat * M_PER_DEG;
  const dx = grid.dLon * M_PER_DEG * cosLat;
  const heights: number[] = [];
  let slopeSum = 0;
  for (let r = 1; r < grid.rows - 1; r++) {
    const y = (grid.north - r * grid.dLat - latitude) * M_PER_DEG;
    for (let c = 1; c < grid.cols - 1; c++) {
      const x = (grid.west + c * grid.dLon - longitude) * M_PER_DEG * cosLat;
      if (x * x + y * y > radiusM * radiusM) continue;
      const at = r * grid.cols + c;
      heights.push(grid.z[at]);
      const gx = (grid.z[at + 1] - grid.z[at - 1]) / (2 * dx);
      const gy = (grid.z[at + grid.cols] - grid.z[at - grid.cols]) / (2 * dy);
      slopeSum += (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
    }
  }
  if (heights.length === 0) return { slope: 0, relief: 0 };
  heights.sort((a, b) => a - b);
  const pick = (p: number) => heights[Math.floor(p * (heights.length - 1))];
  return {
    slope: Math.round((slopeSum / heights.length) * 10) / 10,
    relief: Math.round(pick(0.95) - pick(0.05)),
  };
}

/** The measure round a place, reading the heights from Amazon (about 0.6 MB a file, 1 to 4 files). */
export async function measureTerrainAt(
  latitude: number,
  longitude: number,
  fetcher: typeof fetch = fetch,
): Promise<TerrainMeasure> {
  // One cell more than the radius, so slopes at its edge have both neighbours
  const grid = await readDemGrid(
    latitude,
    longitude,
    TERRAIN_RADIUS_M + 500,
    TERRAIN_LEVEL,
    fetcher,
  );
  return measureTerrain(grid, latitude, longitude);
}
