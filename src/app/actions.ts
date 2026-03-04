'use server';

import { getSites } from './sites/actions';
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
 * Demo sites shown to unauthenticated users
 * These use hardcoded coordinates and fetch weather live
 */
const DEMO_SITES: Site[] = [
  {
    id: 'demo-tiger',
    name: 'Tiger Mountain',
    latitude: 47.4797,
    longitude: -121.9908,
    elevation: 914,
    idealWindDirections: [315, 0, 45], // NW to NE
    maxWindSpeed: 25,
    notes: 'Popular Seattle-area site with reliable thermals',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-dog',
    name: 'Dog Mountain',
    latitude: 45.6994,
    longitude: -121.7064,
    elevation: 853,
    idealWindDirections: [270, 315, 0], // W to N
    maxWindSpeed: 30,
    notes: 'Columbia River Gorge classic with strong conditions',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-chelan',
    name: 'Chelan Butte',
    latitude: 47.8411,
    longitude: -120.0169,
    elevation: 1067,
    idealWindDirections: [180, 225, 270], // S to W
    maxWindSpeed: 35,
    notes: 'Premier XC site in Eastern Washington',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Get forecast data for all sites with scoring
 * Authenticated users see their own sites
 * Unauthenticated users see demo sites
 */
export async function getDashboardData(): Promise<SiteForecastData[]> {
  const session = await auth();

  // Determine which sites to show
  let sites: Site[];
  if (session?.user?.id) {
    // Authenticated: show user's sites
    sites = await getSites();
  } else {
    // Unauthenticated: show demo sites
    sites = DEMO_SITES;
  }

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
 * Works for both authenticated users and demo mode
 */
export async function refreshAllForecasts(): Promise<{ success: boolean; message: string }> {
  try {
    const session = await auth();

    // Determine which sites to refresh
    let sites: Site[];
    if (session?.user?.id) {
      sites = await getSites();
    } else {
      sites = DEMO_SITES;
    }

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
