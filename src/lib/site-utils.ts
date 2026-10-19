/**
 * Site utility functions for duplicate detection and distance calculations
 */

/**
 * Calculate distance between two lat/lng points using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Normalize site names for comparison
 * - Convert to lowercase
 * - Remove common suffixes/prefixes
 * - Trim whitespace
 */
export function normalizeSiteName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(launch|site|takeoff|landing|mountain|mt\.?)\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Check if two site names are similar enough to be considered a match
 */
export function namesAreSimilar(name1: string, name2: string): boolean {
  const normalized1 = normalizeSiteName(name1);
  const normalized2 = normalizeSiteName(name2);

  // Exact match after normalization
  if (normalized1 === normalized2) return true;

  // One contains the other (e.g., "Tiger" matches "Tiger Mountain")
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true;

  return false;
}

/**
 * Find launch sites near a given location that might be duplicates
 * Used when creating custom sites to warn users about existing launch sites
 */
export interface NearbySite {
  id: string;
  name: string;
  slug: string;
  distance: number;
  nameSimilarity: boolean;
}

/**
 * Find launch sites within a given radius that might be duplicates
 */
export function findNearbySites(
  targetLat: number,
  targetLng: number,
  targetName: string,
  allLaunchSites: Array<{
    id: string;
    name: string;
    slug: string;
    latitude: number;
    longitude: number;
  }>,
  radiusKm: number = 5,
): NearbySite[] {
  const nearby: NearbySite[] = [];

  for (const site of allLaunchSites) {
    const distance = calculateDistance(targetLat, targetLng, site.latitude, site.longitude);

    if (distance <= radiusKm) {
      const nameSimilarity = namesAreSimilar(targetName, site.name);
      nearby.push({
        id: site.id,
        name: site.name,
        slug: site.slug,
        distance,
        nameSimilarity,
      });
    }
  }

  // Sort by distance
  nearby.sort((a, b) => a.distance - b.distance);

  return nearby;
}

/** The eight compass points launches are rated on, clockwise from north. */
export const COMPASS_POINTS = [
  { label: 'N', degrees: 0 },
  { label: 'NE', degrees: 45 },
  { label: 'E', degrees: 90 },
  { label: 'SE', degrees: 135 },
  { label: 'S', degrees: 180 },
  { label: 'SW', degrees: 225 },
  { label: 'W', degrees: 270 },
  { label: 'NW', degrees: 315 },
] as const;

/**
 * Compass direction to degrees mapping for wind columns.
 */
const WIND_DIRECTION_DEGREES: Record<string, number> = {
  windN: 0,
  windNe: 45,
  windE: 90,
  windSe: 135,
  windS: 180,
  windSw: 225,
  windW: 270,
  windNw: 315,
};

/**
 * Compute ideal wind directions (degrees) from wind column ratings.
 * A rating of 2 means "ideal" for that direction.
 */
export function getIdealWindDirections(site: {
  windN: number;
  windNe: number;
  windE: number;
  windSe: number;
  windS: number;
  windSw: number;
  windW: number;
  windNw: number;
}): number[] {
  const directions: number[] = [];
  for (const [key, degrees] of Object.entries(WIND_DIRECTION_DEGREES)) {
    if (site[key as keyof typeof site] === 2) {
      directions.push(degrees);
    }
  }
  return directions.sort((a, b) => a - b);
}

/**
 * Directions (degrees) rated 1, "possible", in the wind columns: the launch
 * works in them, but not ideally.
 */
export function getOkWindDirections(site: {
  windN: number;
  windNe: number;
  windE: number;
  windSe: number;
  windS: number;
  windSw: number;
  windW: number;
  windNw: number;
}): number[] {
  return Object.entries(WIND_DIRECTION_DEGREES)
    .filter(([key]) => site[key as keyof typeof site] === 1)
    .map(([, degrees]) => degrees)
    .sort((a, b) => a - b);
}

/**
 * Build an orientations record from wind columns (for UI display).
 * Returns { N: 2, NE: 1, ... } mapping.
 */
export function getOrientations(site: {
  windN: number;
  windNe: number;
  windE: number;
  windSe: number;
  windS: number;
  windSw: number;
  windW: number;
  windNw: number;
}): Record<string, number> {
  return {
    N: site.windN,
    NE: site.windNe,
    E: site.windE,
    SE: site.windSe,
    S: site.windS,
    SW: site.windSw,
    W: site.windW,
    NW: site.windNw,
  };
}

/**
 * Circular mean of wind directions in degrees, so 350° and 10° average to
 * 0°, not 180°.
 */
export function calculateCircularMean(directions: number[]): number {
  if (directions.length === 0) return 0;
  const sin = directions.reduce((sum, dir) => sum + Math.sin((dir * Math.PI) / 180), 0);
  const cos = directions.reduce((sum, dir) => sum + Math.cos((dir * Math.PI) / 180), 0);
  const mean = (Math.atan2(sin, cos) * 180) / Math.PI;
  return mean < 0 ? mean + 360 : mean;
}
