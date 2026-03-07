'use server';

import { getUserFavoriteSites } from '@/app/sites/browse/actions';
import { getForecast, fetchAllForecasts } from '@/lib/weather';
import { calculateDailyScores } from '@/lib/scoring';
import type { Site, Forecast, DayScore } from '@/types';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db, customSites } from '@/db';
import { eq } from 'drizzle-orm';

export interface SiteForecastData {
  site: Site;
  forecast: Forecast | null;
  scores: DayScore[];
  siteType: 'launch' | 'custom'; // Track if this is a launch_site or custom_site
  slug?: string; // For launch sites, include the slug for URL generation
  error?: string;
}

/**
 * Get forecast data for all sites with scoring
 * Shows user's favorited launch sites + custom sites
 * Note: This function requires authentication (enforced at the page level)
 */
export async function getDashboardData(): Promise<SiteForecastData[]> {
  const session = await auth();

  // This should never happen due to page-level auth check, but guard just in case
  if (!session?.user?.id) {
    return [];
  }

  // Get user's custom sites + favorited launch sites
  const [userCustomSites, favoriteSites] = await Promise.all([
    db.query.customSites.findMany({
      where: eq(customSites.userId, session.user.id),
      orderBy: (customSites, { desc }) => [desc(customSites.updatedAt)],
    }),
    getUserFavoriteSites(),
  ]);

  // Track metadata for each site (siteType and slug for URL generation)
  const siteMetadata = new Map<string, { siteType: 'launch' | 'custom'; slug?: string }>();

  // Convert favorited launch sites to Site type
  const favoritesAsSites: Site[] = favoriteSites.map((fav) => {
    // Store metadata for URL generation later
    siteMetadata.set(fav.id, { siteType: 'launch', slug: fav.slug });

    return {
      id: fav.id,
      name: fav.name,
      latitude: parseFloat(fav.latitude),
      longitude: parseFloat(fav.longitude),
      elevation: fav.elevation || 0,
      idealWindDirections: fav.favorite.customIdealDirections || fav.idealWindDirections || [],
      maxWindSpeed: fav.favorite.customMaxWind || fav.maxWindSpeed || 40,
      notes: fav.favorite.notes ?? undefined,
      createdAt: new Date(fav.createdAt).toISOString(),
      updatedAt: new Date(fav.updatedAt).toISOString(),
    };
  });

  // Convert custom sites to Site type
  const customSitesAsSites: Site[] = userCustomSites.map((site) => {
    // Store metadata for URL generation later
    siteMetadata.set(site.id, { siteType: 'custom' });

    return {
      id: site.id,
      name: site.name,
      latitude: parseFloat(site.latitude),
      longitude: parseFloat(site.longitude),
      elevation: site.elevation,
      idealWindDirections: site.idealWindDirections,
      maxWindSpeed: site.maxWindSpeed,
      notes: undefined,
      createdAt: new Date(site.createdAt).toISOString(),
      updatedAt: new Date(site.updatedAt).toISOString(),
    };
  });

  const sites = [...customSitesAsSites, ...favoritesAsSites];

  const results = await Promise.all(
    sites.map(async (site) => {
      const metadata = siteMetadata.get(site.id)!;
      try {
        const forecastResult = await getForecast(
          site.id,
          site.latitude,
          site.longitude,
          metadata.siteType,
        );
        const scores = calculateDailyScores(forecastResult.forecast, site);

        return {
          site,
          forecast: forecastResult.forecast,
          scores,
          siteType: metadata.siteType,
          slug: metadata.slug,
        };
      } catch (error) {
        return {
          site,
          forecast: null,
          scores: [],
          siteType: metadata.siteType,
          slug: metadata.slug,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),
  );

  return results;
}

/**
 * Refresh all forecasts by fetching fresh data
 * Note: Requires authentication (enforced at the page level)
 */
export async function refreshAllForecasts(): Promise<{ success: boolean; message: string }> {
  try {
    const session = await auth();

    // Guard: should never happen due to page-level auth check
    if (!session?.user?.id) {
      return { success: false, message: 'Authentication required' };
    }

    // Get both custom sites and favorited launch sites
    const [userCustomSites, favoriteSites] = await Promise.all([
      db.query.customSites.findMany({
        where: eq(customSites.userId, session.user.id),
      }),
      getUserFavoriteSites(),
    ]);

    // Convert to unified site format for fetching
    const allSites = [
      ...userCustomSites.map((s) => ({
        id: s.id,
        latitude: parseFloat(s.latitude),
        longitude: parseFloat(s.longitude),
      })),
      ...favoriteSites.map((s) => ({
        id: s.id,
        latitude: parseFloat(s.latitude),
        longitude: parseFloat(s.longitude),
      })),
    ];

    if (allSites.length === 0) {
      return { success: false, message: 'No sites configured' };
    }

    await fetchAllForecasts(allSites);

    revalidatePath('/dashboard');
    return { success: true, message: `Refreshed forecasts for ${allSites.length} site(s)` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to refresh forecasts',
    };
  }
}
