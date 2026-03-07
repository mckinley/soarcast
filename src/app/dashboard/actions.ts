'use server';

import { getSites } from '@/app/sites/actions';
import { getUserFavoriteSites } from '@/app/sites/browse/actions';
import { getForecast, fetchAllForecasts } from '@/lib/weather';
import { calculateDailyScores } from '@/lib/scoring';
import type { Site, Forecast, DayScore } from '@/types';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';

export interface SiteForecastData {
  site: Site;
  forecast: Forecast | null;
  scores: DayScore[];
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
  const [customSites, favoriteSites] = await Promise.all([getSites(), getUserFavoriteSites()]);

  // Track which sites are from launch_sites table (for siteType determination)
  const launchSiteIds: Set<string> = new Set();

  // Convert favorited launch sites to Site type
  const favoritesAsSites: Site[] = favoriteSites.map((fav) => {
    launchSiteIds.add(fav.id); // Track launch site IDs
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

  const sites = [...customSites, ...favoritesAsSites];

  const results = await Promise.all(
    sites.map(async (site) => {
      try {
        // Determine siteType based on whether it's in the launch sites set
        const siteType = launchSiteIds.has(site.id) ? 'launch' : 'legacy';
        const forecastResult = await getForecast(site.id, site.latitude, site.longitude, siteType);
        const scores = calculateDailyScores(forecastResult.forecast, site);

        return {
          site,
          forecast: forecastResult.forecast,
          scores,
        };
      } catch (error) {
        return {
          site,
          forecast: null,
          scores: [],
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

    const sites = await getSites();

    if (sites.length === 0) {
      return { success: false, message: 'No sites configured' };
    }

    await fetchAllForecasts(
      sites.map((s) => ({
        id: s.id,
        latitude: s.latitude,
        longitude: s.longitude,
      })),
    );

    revalidatePath('/dashboard');
    return { success: true, message: `Refreshed forecasts for ${sites.length} site(s)` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to refresh forecasts',
    };
  }
}
