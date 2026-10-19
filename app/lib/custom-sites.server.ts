import { and, eq } from 'drizzle-orm';
import { customSites, type CustomSite } from '~/db/schema';
import type { Db } from './db.server';
import { fetchElevations } from '~/lib/terrain';
import type { CustomSiteInput } from '~/lib/custom-sites';

/** A custom site, only if `userId` owns it: never expose another user's site. */
export async function findOwnedCustomSite(
  db: Db,
  id: string,
  userId: string,
): Promise<CustomSite | undefined> {
  return db.query.customSites.findFirst({
    where: and(eq(customSites.id, id), eq(customSites.userId, userId)),
  });
}

/** The entered launch elevation, or the terrain's at the pin when left blank. */
export async function resolveElevation(input: CustomSiteInput): Promise<number | null> {
  if (input.elevation !== null) return input.elevation;
  try {
    const [elevation] = await fetchElevations([
      { latitude: input.latitude, longitude: input.longitude },
    ]);
    return Math.round(elevation);
  } catch (error) {
    console.error('Elevation lookup failed:', error);
    return null;
  }
}

export function customSiteValues(input: CustomSiteInput, elevation: number) {
  return {
    name: input.name,
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    elevation,
    maxWindSpeed: input.maxWindSpeed,
    idealWindDirections: input.goodDirections,
    okWindDirections: input.okDirections,
    notes: input.notes,
  };
}

export const ELEVATION_LOOKUP_ERROR =
  "Couldn't look up the elevation here. Enter the launch height in meters.";
