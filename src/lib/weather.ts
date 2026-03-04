// Weather data fetching service using Open-Meteo API
import { Forecast } from '@/types';
import { readJSON, updateJSON } from './storage';
import type { ForecastsData } from '@/types';

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
  longitude: number
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
    ].join(','),
    daily: ['sunrise', 'sunset'].join(','),
    forecast_days: '7',
    timezone: 'auto',
  });

  const url = `${OPEN_METEO_BASE_URL}?${params.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Open-Meteo API error: ${response.status} ${response.statusText}`
      );
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
 * Gets cached forecast for a site or fetches fresh data if cache is stale/missing
 * @param siteId - Unique site identifier
 * @param latitude - Site latitude
 * @param longitude - Site longitude
 * @returns Cached or fresh forecast data
 */
export async function getForecast(
  siteId: string,
  latitude: number,
  longitude: number
): Promise<Forecast> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const cacheKey = `${siteId}_${today}`;

  // Try to get cached forecast
  const forecastsData = await readJSON<ForecastsData>('forecasts.json', {
    forecasts: {},
  });

  const cachedForecast = forecastsData.forecasts[cacheKey];

  // Check if cache exists and is still valid
  if (cachedForecast) {
    const now = new Date();
    const expiresAt = new Date(cachedForecast.expiresAt);

    if (now < expiresAt) {
      // Cache is still valid, return it
      return cachedForecast;
    }
  }

  // Cache miss or expired - fetch fresh data
  const freshForecast = await fetchWeatherForecast(siteId, latitude, longitude);

  // Store in cache
  await updateJSON<ForecastsData>(
    'forecasts.json',
    { forecasts: {} },
    (data) => {
      data.forecasts[cacheKey] = freshForecast;
      return data;
    }
  );

  return freshForecast;
}

/**
 * Fetches forecasts for multiple sites
 * @param sites - Array of sites with id, latitude, longitude
 * @returns Map of siteId to Forecast
 */
export async function fetchAllForecasts(
  sites: Array<{ id: string; latitude: number; longitude: number }>
): Promise<Record<string, Forecast>> {
  const forecastPromises = sites.map((site) =>
    getForecast(site.id, site.latitude, site.longitude).then((forecast) => ({
      id: site.id,
      forecast,
    }))
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

  await updateJSON<ForecastsData>(
    'forecasts.json',
    { forecasts: {} },
    (data) => {
      const forecasts = data.forecasts;
      const updated: Record<string, Forecast> = {};

      // Keep only non-expired forecasts
      Object.entries(forecasts).forEach(([key, forecast]) => {
        const expiresAt = new Date(forecast.expiresAt);
        if (now < expiresAt) {
          updated[key] = forecast;
        }
      });

      data.forecasts = updated;
      return data;
    }
  );
}
