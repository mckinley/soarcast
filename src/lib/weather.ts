// Weather data fetching service using Open-Meteo API
import { Forecast } from '@/types';
import { db } from '@/db';
import { forecastsCache } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';

// Open-Meteo API configuration
const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_DURATION_HOURS = 6;

// Open-Meteo API response types
interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  daily: {
    time: string[];
    sunrise: string[];
    sunset: string[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m: number[];
    cloud_cover: number[];
    cape: number[];
    precipitation_probability: number[];
    pressure_msl: number[];
    // Upper-air parameters for XC assessment
    boundary_layer_height?: (number | null)[];
    wind_speed_850hPa?: (number | null)[];
    wind_direction_850hPa?: (number | null)[];
    convective_inhibition?: (number | null)[];
  };
}

/**
 * Fetches 7-day hourly weather forecast from Open-Meteo for a given site
 * @param siteId - Unique site identifier
 * @param latitude - Site latitude
 * @param longitude - Site longitude
 * @returns Forecast data with hourly weather parameters
 */
export async function fetchWeatherForecast(
  siteId: string,
  latitude: number,
  longitude: number,
): Promise<Forecast> {
  // Build API URL with all required hourly parameters
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    hourly: [
      'temperature_2m',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'cloud_cover',
      'cape',
      'precipitation_probability',
      'pressure_msl',
      // Upper-air parameters for XC assessment
      'boundary_layer_height',
      'wind_speed_850hPa',
      'wind_direction_850hPa',
      'convective_inhibition',
    ].join(','),
    daily: ['sunrise', 'sunset'].join(','),
    forecast_days: '7',
    timezone: 'auto',
  });

  const url = `${OPEN_METEO_BASE_URL}?${params.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
    }

    const data: OpenMeteoResponse = await response.json();

    // Calculate expiration time (current time + 6 hours)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_DURATION_HOURS * 60 * 60 * 1000);

    // Build Forecast object
    const forecast: Forecast = {
      siteId,
      fetchedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      modelElevation: data.elevation,
      sunrise: data.daily.sunrise[0] || '', // First day's sunrise
      sunset: data.daily.sunset[0] || '', // First day's sunset
      hourly: {
        time: data.hourly.time,
        temperature_2m: data.hourly.temperature_2m,
        wind_speed_10m: data.hourly.wind_speed_10m,
        wind_direction_10m: data.hourly.wind_direction_10m,
        wind_gusts_10m: data.hourly.wind_gusts_10m,
        cloud_cover: data.hourly.cloud_cover,
        cape: data.hourly.cape,
        precipitation_probability: data.hourly.precipitation_probability,
        pressure_msl: data.hourly.pressure_msl,
        // Upper-air parameters (handle missing values gracefully with empty arrays of nulls)
        boundary_layer_height:
          data.hourly.boundary_layer_height ?? data.hourly.time.map(() => null),
        wind_speed_850hPa: data.hourly.wind_speed_850hPa ?? data.hourly.time.map(() => null),
        wind_direction_850hPa:
          data.hourly.wind_direction_850hPa ?? data.hourly.time.map(() => null),
        convective_inhibition:
          data.hourly.convective_inhibition ?? data.hourly.time.map(() => null),
      },
    };

    return forecast;
  } catch (error) {
    // Wrap any error in a descriptive message
    if (error instanceof Error) {
      throw new Error(`Failed to fetch weather data: ${error.message}`);
    }
    throw new Error('Failed to fetch weather data: Unknown error');
  }
}

/**
 * Check if a site ID is a demo site (not stored in the database)
 */
function isDemoSite(siteId: string): boolean {
  return siteId.startsWith('demo-');
}

/**
 * Gets cached forecast for a site or fetches fresh data if cache is stale/missing
 * Demo sites (IDs starting with "demo-") skip DB caching since they have no
 * foreign key in the sites table.
 * @param siteId - Unique site identifier
 * @param latitude - Site latitude
 * @param longitude - Site longitude
 * @returns Cached or fresh forecast data
 */
export async function getForecast(
  siteId: string,
  latitude: number,
  longitude: number,
): Promise<Forecast> {
  // Demo sites skip DB caching entirely — just fetch fresh data
  if (isDemoSite(siteId)) {
    return fetchWeatherForecast(siteId, latitude, longitude);
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const now = new Date();

  // Try to get cached forecast from Turso
  const [cachedRow] = await db
    .select()
    .from(forecastsCache)
    .where(and(eq(forecastsCache.siteId, siteId), eq(forecastsCache.fetchDate, today)))
    .limit(1);

  // Check if cache exists and is still valid
  if (cachedRow && new Date(cachedRow.expiresAt) > now) {
    // Cache is still valid, parse and return it
    return cachedRow.data as Forecast;
  }

  // Cache miss or expired - fetch fresh data
  const freshForecast = await fetchWeatherForecast(siteId, latitude, longitude);

  // Store in Turso cache (upsert pattern)
  await db
    .insert(forecastsCache)
    .values({
      siteId,
      fetchDate: today,
      data: freshForecast,
      fetchedAt: new Date(freshForecast.fetchedAt),
      expiresAt: new Date(freshForecast.expiresAt),
    })
    .onConflictDoUpdate({
      target: [forecastsCache.siteId, forecastsCache.fetchDate],
      set: {
        data: freshForecast,
        fetchedAt: new Date(freshForecast.fetchedAt),
        expiresAt: new Date(freshForecast.expiresAt),
      },
    });

  return freshForecast;
}

/**
 * Fetches forecasts for multiple sites
 * @param sites - Array of sites with id, latitude, longitude
 * @returns Map of siteId to Forecast
 */
export async function fetchAllForecasts(
  sites: Array<{ id: string; latitude: number; longitude: number }>,
): Promise<Record<string, Forecast>> {
  const forecastPromises = sites.map((site) =>
    getForecast(site.id, site.latitude, site.longitude).then((forecast) => ({
      id: site.id,
      forecast,
    })),
  );

  const results = await Promise.all(forecastPromises);

  // Convert array to map
  const forecastMap: Record<string, Forecast> = {};
  results.forEach(({ id, forecast }) => {
    forecastMap[id] = forecast;
  });

  return forecastMap;
}

/**
 * Clears expired forecast cache entries
 * Useful for cleanup, but not required for normal operation
 */
export async function clearExpiredForecasts(): Promise<void> {
  const now = new Date();

  // Delete expired forecasts from Turso using SQL template
  // Drizzle ORM doesn't have lt() operator, so we use sql template for date comparison
  await db.delete(forecastsCache).where(sql`${forecastsCache.expiresAt} < ${now.getTime()}`);
}
