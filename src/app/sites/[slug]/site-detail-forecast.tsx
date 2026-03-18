import { getForecast } from '@/lib/weather';
import { calculateDailyScores, calculateDailyScoresFromProfile } from '@/lib/scoring';
import { getAtmosphericProfile } from '@/lib/weather-profile';
import { SiteDetailClient } from '@/components/site-detail-client';

interface SiteDetailForecastProps {
  site: {
    id: string;
    name: string;
    latitude: string;
    longitude: string;
    elevation: number | null;
    idealWindDirections: number[] | null;
    maxWindSpeed: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Forecast component that can be loaded with Suspense
 * This allows the site info to render immediately while forecast data streams in
 */
export async function SiteDetailForecast({ site }: SiteDetailForecastProps) {
  let forecast = null;
  let scores = null;
  let error = null;

  try {
    const lat = parseFloat(site.latitude);
    const lng = parseFloat(site.longitude);
    const forecastResult = await getForecast(site.id, lat, lng, 'launch');

    forecast = forecastResult.forecast;

    if (forecast) {
      // Convert launch site to the format expected by scoring
      const siteForScoring = {
        id: site.id,
        name: site.name,
        latitude: lat,
        longitude: lng,
        elevation: site.elevation || 0,
        idealWindDirections: site.idealWindDirections || [],
        maxWindSpeed: site.maxWindSpeed || 40,
        createdAt: new Date(site.createdAt).toISOString(),
        updatedAt: new Date(site.updatedAt).toISOString(),
      };

      // Use v2 scoring with atmospheric profile when available
      try {
        const profileResult = await getAtmosphericProfile(lat, lng, 7);
        scores = calculateDailyScoresFromProfile(profileResult.profile, forecast, siteForScoring);
      } catch {
        // Fall back to v1 scoring if profile fetch fails
        scores = calculateDailyScores(forecast, siteForScoring);
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to fetch forecast';
  }

  // Render error state
  if (error) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-700 dark:text-red-400">
        <p className="font-medium">Error loading forecast</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  // Render no data state
  if (!forecast || !scores) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">No forecast data available</p>
      </div>
    );
  }

  // Render forecast with windgram
  return (
    <SiteDetailClient
      site={{
        id: site.id,
        name: site.name,
        latitude: parseFloat(site.latitude),
        longitude: parseFloat(site.longitude),
        elevation: site.elevation || 0,
        idealWindDirections: site.idealWindDirections || [],
        maxWindSpeed: site.maxWindSpeed || 40,
        createdAt: new Date(site.createdAt).toISOString(),
        updatedAt: new Date(site.updatedAt).toISOString(),
      }}
      forecast={forecast}
      scores={scores}
    />
  );
}
