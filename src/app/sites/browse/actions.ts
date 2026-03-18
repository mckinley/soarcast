'use server';

import { eq, and, like, or, inArray } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, launchSites, userFavoriteSites, forecastsCache } from '@/db';
import type { LaunchSite, UserFavoriteSite } from '@/db/schema';
import { revalidatePath } from 'next/cache';
import { calculateDailyScores } from '@/lib/scoring';
import type { Forecast } from '@/types';

/**
 * Get all launch sites with optional filtering
 */
export async function getLaunchSites(filters?: {
  search?: string;
  region?: string;
  country?: string;
  siteType?: string;
  orientations?: string[]; // e.g., ['N', 'NE', 'E']
}): Promise<LaunchSite[]> {
  const conditions = [];

  // Full-text search across name, region, country
  if (filters?.search) {
    conditions.push(
      or(
        like(launchSites.name, `%${filters.search}%`),
        like(launchSites.region, `%${filters.search}%`),
        like(launchSites.countryCode, `%${filters.search}%`),
      ),
    );
  }

  // Filter by region
  if (filters?.region) {
    conditions.push(eq(launchSites.region, filters.region));
  }

  // Filter by country
  if (filters?.country) {
    conditions.push(eq(launchSites.countryCode, filters.country));
  }

  // Filter by site type
  if (filters?.siteType) {
    conditions.push(eq(launchSites.siteType, filters.siteType));
  }

  // Note: orientation filtering is done client-side in the component
  // because orientations is a JSON field and complex to query efficiently in SQLite

  const sites = await db.query.launchSites.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: (launchSites, { asc }) => [asc(launchSites.name)],
  });

  return sites;
}

/**
 * Get unique values for filter dropdowns
 */
export async function getFilterOptions(): Promise<{
  regions: string[];
  countries: string[];
  siteTypes: string[];
}> {
  const sites = await db.query.launchSites.findMany();

  // Extract unique values
  const regions = [...new Set(sites.map((s) => s.region).filter(Boolean))] as string[];
  const countries = [...new Set(sites.map((s) => s.countryCode).filter(Boolean))] as string[];
  const siteTypes = [...new Set(sites.map((s) => s.siteType).filter(Boolean))] as string[];

  return {
    regions: regions.sort(),
    countries: countries.sort(),
    siteTypes: siteTypes.sort(),
  };
}

/**
 * Get a single launch site by slug
 */
export async function getLaunchSiteBySlug(slug: string): Promise<LaunchSite | null> {
  const site = await db.query.launchSites.findFirst({
    where: eq(launchSites.slug, slug),
  });

  return site ?? null;
}

/**
 * Get user's favorite sites (must be authenticated)
 */
export async function getUserFavoriteSites(): Promise<
  Array<LaunchSite & { favorite: UserFavoriteSite }>
> {
  const session = await auth();

  if (!session?.user?.id) {
    return [];
  }

  const favorites = await db.query.userFavoriteSites.findMany({
    where: eq(userFavoriteSites.userId, session.user.id),
    with: {
      site: true,
    },
  });

  return favorites.map((fav) => ({
    ...fav.site,
    favorite: {
      id: fav.id,
      userId: fav.userId,
      siteId: fav.siteId,
      notes: fav.notes,
      customMaxWind: fav.customMaxWind,
      customIdealDirections: fav.customIdealDirections,
      notify: fav.notify,
      createdAt: fav.createdAt,
    },
  }));
}

/**
 * Check if a site is favorited by the current user
 */
export async function isSiteFavorited(siteId: string): Promise<boolean> {
  const session = await auth();

  if (!session?.user?.id) {
    return false;
  }

  const favorite = await db.query.userFavoriteSites.findFirst({
    where: and(eq(userFavoriteSites.userId, session.user.id), eq(userFavoriteSites.siteId, siteId)),
  });

  return !!favorite;
}

/**
 * Get the user's favorite record for a specific site (for customMaxWind etc.)
 * Returns null if not favorited or unauthenticated
 */
export async function getUserFavoriteSite(
  siteId: string,
): Promise<{ customMaxWind: number | null } | null> {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const favorite = await db.query.userFavoriteSites.findFirst({
    where: and(eq(userFavoriteSites.userId, session.user.id), eq(userFavoriteSites.siteId, siteId)),
    columns: { customMaxWind: true },
  });

  return favorite ?? null;
}

/**
 * Add a site to user's favorites
 */
export async function favoriteSite(siteId: string): Promise<void> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await db.insert(userFavoriteSites).values({
    userId: session.user.id,
    siteId: siteId,
    notify: false,
  });

  revalidatePath('/sites/browse');
  revalidatePath('/');
}

/**
 * Remove a site from user's favorites
 */
export async function unfavoriteSite(siteId: string): Promise<void> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await db
    .delete(userFavoriteSites)
    .where(
      and(eq(userFavoriteSites.userId, session.user.id), eq(userFavoriteSites.siteId, siteId)),
    );

  revalidatePath('/sites/browse');
  revalidatePath('/');
}

/**
 * Get today's flyability scores for a batch of sites from cached forecasts.
 * Returns a map of siteId → score (0-100) for sites with cached data, null for cache misses.
 */
export async function getSiteScoresForBrowse(
  sites: LaunchSite[],
): Promise<Record<string, number | null>> {
  if (sites.length === 0) return {};

  const today = new Date().toISOString().split('T')[0];
  const siteIds = sites.map((s) => s.id);

  // Single batch query for all site forecasts
  const cached = await db
    .select({
      siteId: forecastsCache.siteId,
      data: forecastsCache.data,
    })
    .from(forecastsCache)
    .where(
      and(
        inArray(forecastsCache.siteId, siteIds),
        eq(forecastsCache.siteType, 'launch'),
        eq(forecastsCache.fetchDate, today),
      ),
    );

  // Build a lookup of siteId → forecast data
  const forecastMap = new Map<string, Forecast>();
  for (const row of cached) {
    forecastMap.set(row.siteId, row.data as Forecast);
  }

  // Build a lookup of siteId → LaunchSite for score computation
  const siteMap = new Map<string, LaunchSite>();
  for (const site of sites) {
    siteMap.set(site.id, site);
  }

  // Compute today's score for each site with cached data
  const scores: Record<string, number | null> = {};
  for (const siteId of siteIds) {
    const forecast = forecastMap.get(siteId);
    const site = siteMap.get(siteId)!;

    if (!forecast) {
      scores[siteId] = null;
      continue;
    }

    const siteForScoring = {
      id: site.id,
      name: site.name,
      latitude: parseFloat(site.latitude),
      longitude: parseFloat(site.longitude),
      elevation: site.elevation || 0,
      idealWindDirections: site.idealWindDirections || [],
      maxWindSpeed: site.maxWindSpeed || 40,
      createdAt: site.createdAt?.toISOString() || '',
      updatedAt: site.updatedAt?.toISOString() || '',
    };

    const dayScores = calculateDailyScores(forecast, siteForScoring);
    // Today is the first day in the forecast
    scores[siteId] = dayScores.length > 0 ? dayScores[0].overallScore : null;
  }

  return scores;
}
