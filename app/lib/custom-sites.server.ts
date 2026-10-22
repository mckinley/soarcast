import { and, eq } from 'drizzle-orm';
import { customSites, type CustomSite } from '~/db/schema';
import type { Db } from './db.server';
import { fetchElevations } from '~/lib/terrain';
import { sharedSiteBody, sharedSiteRef, type CustomSiteInput } from '~/lib/custom-sites';
import { shareSite, unshareSite } from '~/lib/pgsites-client';

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
    siteKind: input.kind,
    goal: input.goal,
    notes: input.notes,
  };
}

/** Why sharing didn't happen: a listed site covers the launch, or pgsites failed. */
export type ShareProblem = { listed: string } | 'failed';

export function shareProblemMessage(problem: ShareProblem): string {
  return problem === 'failed'
    ? "Sharing didn't work just now. The site is saved. Try again later."
    : `${problem.listed} is already listed at this launch. Follow it instead of sharing this one.`;
}

/**
 * Shares the site, changes its shared copy, or takes the copy back, as the
 * pilot chose (`share`), and keeps custom_sites.shared_site_id in step.
 * Returns what went wrong, or null.
 */
export async function syncSharing(
  db: Db,
  apiKey: string,
  site: Pick<CustomSite, 'id' | 'sharedSiteId'>,
  share: { input: CustomSiteInput; elevation: number } | null,
): Promise<ShareProblem | null> {
  const ref = sharedSiteRef(site.id);
  try {
    if (!share?.input.share) {
      if (!site.sharedSiteId) return null;
      await unshareSite(apiKey, ref);
      await db.update(customSites).set({ sharedSiteId: null }).where(eq(customSites.id, site.id));
      return null;
    }
    const result = await shareSite(apiKey, ref, sharedSiteBody(share.input, share.elevation));
    if (!result.ok) return { listed: result.listed.name };
    if (result.id !== site.sharedSiteId) {
      await db
        .update(customSites)
        .set({ sharedSiteId: result.id })
        .where(eq(customSites.id, site.id));
    }
    return null;
  } catch (error) {
    console.error('Sharing a private site failed:', error);
    return 'failed';
  }
}

export const ELEVATION_LOOKUP_ERROR =
  "Couldn't look up the elevation here. Enter the launch height in meters.";
