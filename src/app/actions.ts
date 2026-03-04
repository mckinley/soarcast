'use server';

import { getSites } from './sites/actions';
import { getForecast, fetchAllForecasts } from '@/lib/weather';
import { calculateDailyScores } from '@/lib/scoring';
import type { Site, Forecast, DayScore } from '@/types';
import { revalidatePath } from 'next/cache';

export interface SiteForecastData {
  site: Site;
  forecast: Forecast | null;
  scores: DayScore[];
  error?: string;
}

/**
 * Get forecast data for all sites with scoring
 */
export async function getDashboardData(): Promise<SiteForecastData[]> {
  const sites = await getSites();

  const results = await Promise.all(
    sites.map(async (site) => {
      try {
        const forecast = await getForecast(site.id, site.latitude, site.longitude);
        const scores = calculateDailyScores(forecast, site);

        return {
          site,
          forecast,
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
    })
  );

  return results;
}

/**
 * Refresh all forecasts by fetching fresh data
 */
export async function refreshAllForecasts(): Promise<{ success: boolean; message: string }> {
  try {
    const sites = await getSites();

    if (sites.length === 0) {
      return { success: false, message: 'No sites configured' };
    }

    await fetchAllForecasts(
      sites.map((s) => ({
        id: s.id,
        latitude: s.latitude,
        longitude: s.longitude,
      }))
    );

    revalidatePath('/');
    return { success: true, message: `Refreshed forecasts for ${sites.length} site(s)` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to refresh forecasts',
    };
  }
}
