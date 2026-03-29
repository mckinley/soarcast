// Atmospheric profile data service using Open-Meteo pressure-level API
// Fetches full vertical atmospheric profiles for windgram visualizations

import type { LibSQLDatabase } from 'drizzle-orm/libsql';

// DB injection for CF Workers compatibility
let _injectedDb: LibSQLDatabase<unknown> | null = null;

export function setProfileDb(db: LibSQLDatabase<unknown>) {
  _injectedDb = db;
}

const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_DURATION_HOURS = 3;

// Pressure levels to fetch (hPa)
const PRESSURE_LEVELS = [1000, 950, 900, 850, 800, 700, 600, 500] as const;
type PressureLevelValue = (typeof PRESSURE_LEVELS)[number];

/**
 * Data at a single pressure level
 */
export interface PressureLevel {
  pressure: PressureLevelValue; // hPa
  temperature: number; // °C
  windSpeed: number; // km/h
  windDirection: number; // degrees
  relativeHumidity: number; // %
  geopotentialHeight: number; // meters
  cloudCover: number; // %
}

/**
 * Surface-level meteorological data
 */
export interface SurfaceData {
  temperature: number; // °C
  windSpeed: number; // km/h
  windDirection: number; // degrees
  windGusts: number; // km/h
  cloudCover: number; // %
  cape: number; // J/kg
  precipitationProbability: number; // %
  boundaryLayerHeight: number | null; // meters
  convectiveInhibition: number | null; // J/kg
  liftedIndex: number | null; // °C
  shortwaveRadiation: number; // W/m²
}

/**
 * Derived thermal parameters calculated from atmospheric profile
 */
export interface DerivedParameters {
  lapseRate: number | null; // °C/1000ft (850-700 hPa typical)
  thermalIndex: number | null; // Composite soaring metric 0-100
  estimatedCloudBase: number | null; // meters AGL
  estimatedTopOfLift: number | null; // meters MSL
  wStar: number | null; // Thermal updraft velocity (m/s)
  freezingLevel: number | null; // 0°C isotherm altitude (meters MSL)
  windShearMax: number | null; // Max wind speed delta between adjacent levels (km/h) in 1000-700hPa
  odPotential: number; // Overdevelopment potential index 0-3
}

/**
 * Complete atmospheric data for a single hour
 */
export interface AtmosphericHour {
  time: string; // ISO 8601
  pressureLevels: PressureLevel[];
  surface: SurfaceData;
  derived: DerivedParameters;
}

/**
 * Complete atmospheric profile response
 */
export interface AtmosphericProfile {
  latitude: number;
  longitude: number;
  elevation: number; // meters
  timezone: string;
  fetchedAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  hours: AtmosphericHour[];
}

/**
 * Open-Meteo API response structure for pressure-level data
 */
interface OpenMeteoProfileResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  hourly: {
    time: string[];
    // Surface parameters
    temperature_2m: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m: number[];
    cloud_cover: number[];
    cape: number[];
    precipitation_probability: number[];
    boundary_layer_height: (number | null)[];
    convective_inhibition: (number | null)[];
    lifted_index: (number | null)[];
    shortwave_radiation: number[];
    // Pressure-level parameters (8 levels × 6 params = 48 fields)
    temperature_1000hPa: number[];
    temperature_950hPa: number[];
    temperature_900hPa: number[];
    temperature_850hPa: number[];
    temperature_800hPa: number[];
    temperature_700hPa: number[];
    temperature_600hPa: number[];
    temperature_500hPa: number[];
    wind_speed_1000hPa: number[];
    wind_speed_950hPa: number[];
    wind_speed_900hPa: number[];
    wind_speed_850hPa: number[];
    wind_speed_800hPa: number[];
    wind_speed_700hPa: number[];
    wind_speed_600hPa: number[];
    wind_speed_500hPa: number[];
    wind_direction_1000hPa: number[];
    wind_direction_950hPa: number[];
    wind_direction_900hPa: number[];
    wind_direction_850hPa: number[];
    wind_direction_800hPa: number[];
    wind_direction_700hPa: number[];
    wind_direction_600hPa: number[];
    wind_direction_500hPa: number[];
    relative_humidity_1000hPa: number[];
    relative_humidity_950hPa: number[];
    relative_humidity_900hPa: number[];
    relative_humidity_850hPa: number[];
    relative_humidity_800hPa: number[];
    relative_humidity_700hPa: number[];
    relative_humidity_600hPa: number[];
    relative_humidity_500hPa: number[];
    geopotential_height_1000hPa: number[];
    geopotential_height_950hPa: number[];
    geopotential_height_900hPa: number[];
    geopotential_height_850hPa: number[];
    geopotential_height_800hPa: number[];
    geopotential_height_700hPa: number[];
    geopotential_height_600hPa: number[];
    geopotential_height_500hPa: number[];
    cloud_cover_1000hPa: (number | null)[];
    cloud_cover_950hPa: (number | null)[];
    cloud_cover_900hPa: (number | null)[];
    cloud_cover_850hPa: (number | null)[];
    cloud_cover_800hPa: (number | null)[];
    cloud_cover_700hPa: (number | null)[];
    cloud_cover_600hPa: (number | null)[];
    cloud_cover_500hPa: (number | null)[];
  };
}

/**
 * Calculates lapse rate between two pressure levels
 * @param tempLower - Temperature at lower level (°C)
 * @param tempUpper - Temperature at upper level (°C)
 * @param heightLower - Geopotential height at lower level (meters)
 * @param heightUpper - Geopotential height at upper level (meters)
 * @returns Lapse rate in °C/1000ft, or null if invalid
 */
export function calculateLapseRate(
  tempLower: number,
  tempUpper: number,
  heightLower: number,
  heightUpper: number,
): number | null {
  const heightDiffMeters = heightUpper - heightLower;
  if (heightDiffMeters <= 0) return null;

  const heightDiffFeet = heightDiffMeters * 3.28084;
  const tempDiff = tempLower - tempUpper;

  return (tempDiff / heightDiffFeet) * 1000;
}

/**
 * Estimates cloud base from surface temperature and dewpoint
 * Using simplified formula: cloud base (ft) ≈ (T - Td) / 2.5 × 1000
 * @param temperature - Surface temperature (°C)
 * @param relativeHumidity - Surface RH (%)
 * @returns Estimated cloud base in meters AGL, or null if conditions don't support clouds
 */
export function estimateCloudBase(temperature: number, relativeHumidity: number): number | null {
  if (relativeHumidity >= 95) return 0; // On ground
  if (relativeHumidity < 50) return null; // Unlikely to form clouds

  // Calculate dewpoint using Magnus formula approximation
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * temperature) / (b + temperature) + Math.log(relativeHumidity / 100);
  const dewpoint = (b * alpha) / (a - alpha);

  const tempSpread = temperature - dewpoint;
  const cloudBaseFeet = (tempSpread / 2.5) * 1000;
  return cloudBaseFeet * 0.3048; // Convert to meters
}

/**
 * Calculates a composite thermal index from atmospheric parameters
 * Higher values indicate better soaring conditions (0-100 scale)
 * @param lapseRate - Lapse rate °C/1000ft (higher = more unstable)
 * @param cape - CAPE value J/kg (higher = stronger thermals)
 * @param cin - Convective inhibition J/kg (lower = easier thermal triggering)
 * @param windSpeed - Surface wind speed km/h (moderate optimal)
 * @returns Thermal index 0-100, or null if insufficient data
 */
export function calculateThermalIndex(
  lapseRate: number | null,
  cape: number,
  cin: number | null,
  windSpeed: number,
): number | null {
  if (lapseRate === null) return null;

  // Lapse rate component (0-40 points): ideal is > 2.5°C/1000ft
  const lapseScore = Math.min(40, Math.max(0, (lapseRate - 1.5) * 20));

  // CAPE component (0-30 points): good above 500 J/kg
  const capeScore = Math.min(30, (cape / 1000) * 30);

  // CIN component (0-15 points): lower is better, penalize above 50 J/kg
  const cinScore = cin !== null ? Math.max(0, 15 - Math.abs(cin) / 10) : 7.5;

  // Wind component (0-15 points): optimal 10-20 km/h
  const windScore =
    windSpeed < 5 ? windSpeed * 2 : windSpeed > 35 ? Math.max(0, 15 - (windSpeed - 35) * 0.5) : 15;

  return Math.round(lapseScore + capeScore + cinScore + windScore);
}

/**
 * Calculates thermal updraft velocity (W*) from CAPE
 * Uses simplified approximation: W* ≈ 0.12 * sqrt(CAPE)
 * @param cape - Convective Available Potential Energy (J/kg)
 * @returns Thermal velocity in m/s, or null if CAPE is invalid
 */
export function calculateThermalVelocity(cape: number | null): number | null {
  if (cape === null || cape <= 0) return null;
  return 0.12 * Math.sqrt(cape);
}

/**
 * Estimates top of lift from boundary layer height and CAPE
 * @param blh - Boundary layer height (meters)
 * @param cape - CAPE value (J/kg)
 * @returns Estimated top of lift in meters MSL, or null if insufficient data
 */
export function estimateTopOfLift(blh: number | null, cape: number): number | null {
  if (blh === null || blh <= 0) return null;

  // Use BLH as base, add CAPE-based boost (every 100 J/kg adds ~100m)
  const capeBoost = Math.min(2000, (cape / 100) * 100);
  return Math.round(blh + capeBoost);
}

/**
 * Interpolates the freezing level (0°C isotherm) from pressure-level data
 * @param pressureLevels - Array of pressure levels with temperature and geopotential height
 * @returns Freezing level in meters MSL, or null if not found
 */
export function calculateFreezingLevel(pressureLevels: PressureLevel[]): number | null {
  // Walk from lowest (highest pressure) to highest (lowest pressure) level
  for (let i = 0; i < pressureLevels.length - 1; i++) {
    const lower = pressureLevels[i];
    const upper = pressureLevels[i + 1];

    // Look for where temperature crosses 0°C
    if (
      (lower.temperature >= 0 && upper.temperature <= 0) ||
      (lower.temperature <= 0 && upper.temperature >= 0)
    ) {
      // Linear interpolation
      const tempDiff = lower.temperature - upper.temperature;
      if (tempDiff === 0) return lower.geopotentialHeight;
      const fraction = lower.temperature / tempDiff;
      return Math.round(
        lower.geopotentialHeight + fraction * (upper.geopotentialHeight - lower.geopotentialHeight),
      );
    }
  }

  // If all temperatures are above 0°C, freezing level is above our top level
  // If all below 0°C, freezing level is below our bottom level
  return null;
}

/**
 * Calculates max wind shear between adjacent pressure levels in the soaring layer (1000-700 hPa)
 * @param pressureLevels - Array of pressure levels with wind speed data
 * @returns Maximum wind speed delta (km/h) between adjacent levels, or null
 */
export function calculateWindShearMax(pressureLevels: PressureLevel[]): number | null {
  // Filter to soaring layer: 1000-700 hPa
  const soaringLevels = pressureLevels.filter((l) => l.pressure >= 700 && l.pressure <= 1000);
  if (soaringLevels.length < 2) return null;

  let maxShear = 0;
  for (let i = 0; i < soaringLevels.length - 1; i++) {
    const delta = Math.abs(soaringLevels[i].windSpeed - soaringLevels[i + 1].windSpeed);
    if (delta > maxShear) maxShear = delta;
  }

  return Math.round(maxShear * 10) / 10;
}

/**
 * Calculates overdevelopment (OD) potential index (0-3)
 * +1 if CAPE > 1500 J/kg
 * +1 if estimated cloud base AGL < 1500m
 * +1 if local hour is 13-17 (peak convective hours)
 * @param cape - CAPE value (J/kg)
 * @param cloudBaseAgl - Estimated cloud base in meters AGL (or null)
 * @param utcHour - Hour in UTC (0-23)
 * @param timezone - IANA timezone string
 * @returns OD potential index 0-3
 */
export function calculateOdPotential(
  cape: number,
  cloudBaseAgl: number | null,
  utcHour: number,
  timezone: string,
): number {
  let score = 0;

  if (cape > 1500) score++;
  if (cloudBaseAgl !== null && cloudBaseAgl < 1500) score++;

  // Convert UTC hour to local hour
  try {
    const date = new Date(Date.UTC(2024, 0, 1, utcHour, 0, 0));
    const localHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      }).format(date),
    );
    if (localHour >= 13 && localHour <= 17) score++;
  } catch {
    // If timezone conversion fails, skip the hour check
  }

  return score;
}

/**
 * Calculates OD potential when local hour is already known
 * (e.g., from Open-Meteo time strings which are in local timezone)
 */
export function calculateOdPotentialFromLocalHour(
  cape: number,
  cloudBaseAgl: number | null,
  localHour: number,
): number {
  let score = 0;
  if (cape > 1500) score++;
  if (cloudBaseAgl !== null && cloudBaseAgl < 1500) score++;
  if (localHour >= 13 && localHour <= 17) score++;
  return score;
}

/**
 * Fetches atmospheric profile data from Open-Meteo
 * @param latitude - Location latitude
 * @param longitude - Location longitude
 * @param days - Number of forecast days (default 2)
 * @returns Complete atmospheric profile with derived parameters
 */
export async function fetchAtmosphericProfile(
  latitude: number,
  longitude: number,
  days: number = 2,
): Promise<AtmosphericProfile> {
  // Build surface parameter list
  const surfaceParams = [
    'temperature_2m',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m',
    'cloud_cover',
    'cape',
    'precipitation_probability',
    'boundary_layer_height',
    'convective_inhibition',
    'lifted_index',
    'shortwave_radiation',
  ];

  // Build pressure-level parameter list
  const pressureParams: string[] = [];
  const paramTypes = [
    'temperature',
    'wind_speed',
    'wind_direction',
    'relative_humidity',
    'geopotential_height',
    'cloud_cover',
  ];

  for (const param of paramTypes) {
    for (const level of PRESSURE_LEVELS) {
      pressureParams.push(`${param}_${level}hPa`);
    }
  }

  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    hourly: [...surfaceParams, ...pressureParams].join(','),
    forecast_days: days.toString(),
    timezone: 'auto',
  });

  const url = `${OPEN_METEO_BASE_URL}?${params.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
    }

    const data: OpenMeteoProfileResponse = await response.json();

    // Calculate expiration time (current time + 3 hours)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_DURATION_HOURS * 60 * 60 * 1000);

    // Process each hour
    const hours: AtmosphericHour[] = data.hourly.time.map((time, idx) => {
      // Build pressure levels array
      const pressureLevels: PressureLevel[] = PRESSURE_LEVELS.map((pressure) => ({
        pressure,
        temperature: data.hourly[`temperature_${pressure}hPa`][idx],
        windSpeed: data.hourly[`wind_speed_${pressure}hPa`][idx],
        windDirection: data.hourly[`wind_direction_${pressure}hPa`][idx],
        relativeHumidity: data.hourly[`relative_humidity_${pressure}hPa`][idx],
        geopotentialHeight: data.hourly[`geopotential_height_${pressure}hPa`][idx],
        cloudCover: data.hourly[`cloud_cover_${pressure}hPa`][idx] ?? 0,
      }));

      // Surface data
      const surface: SurfaceData = {
        temperature: data.hourly.temperature_2m[idx],
        windSpeed: data.hourly.wind_speed_10m[idx],
        windDirection: data.hourly.wind_direction_10m[idx],
        windGusts: data.hourly.wind_gusts_10m[idx],
        cloudCover: data.hourly.cloud_cover[idx],
        cape: data.hourly.cape[idx],
        precipitationProbability: data.hourly.precipitation_probability[idx],
        boundaryLayerHeight: data.hourly.boundary_layer_height[idx],
        convectiveInhibition: data.hourly.convective_inhibition[idx],
        liftedIndex: data.hourly.lifted_index[idx],
        shortwaveRadiation: data.hourly.shortwave_radiation[idx],
      };

      // Calculate derived parameters
      // Use 850-700 hPa for lapse rate (typical thermal layer)
      const level850 = pressureLevels.find((l) => l.pressure === 850);
      const level700 = pressureLevels.find((l) => l.pressure === 700);

      const lapseRate =
        level850 && level700
          ? calculateLapseRate(
              level850.temperature,
              level700.temperature,
              level850.geopotentialHeight,
              level700.geopotentialHeight,
            )
          : null;

      // Estimate cloud base from surface temperature and humidity
      // Use 950 hPa as "surface" (closer to typical launch elevations)
      const surfaceLevel = pressureLevels.find((l) => l.pressure === 950);
      const cloudBase = surfaceLevel
        ? estimateCloudBase(surfaceLevel.temperature, surfaceLevel.relativeHumidity)
        : null;

      // Calculate thermal index
      const thermalIndex = calculateThermalIndex(
        lapseRate,
        surface.cape,
        surface.convectiveInhibition,
        surface.windSpeed,
      );

      // Estimate top of lift
      const topOfLift = estimateTopOfLift(surface.boundaryLayerHeight, surface.cape);

      // W* (thermal updraft velocity)
      const wStar = calculateThermalVelocity(surface.cape);

      // Freezing level (0°C isotherm)
      const freezingLevel = calculateFreezingLevel(pressureLevels);

      // Wind shear max in soaring layer
      const windShearMax = calculateWindShearMax(pressureLevels);

      // OD potential — Open-Meteo returns local times with timezone=auto
      const localHour = parseInt(time.slice(11, 13));
      const odPotential = calculateOdPotentialFromLocalHour(surface.cape, cloudBase, localHour);

      const derived: DerivedParameters = {
        lapseRate,
        thermalIndex,
        estimatedCloudBase: cloudBase,
        estimatedTopOfLift: topOfLift,
        wStar,
        freezingLevel,
        windShearMax,
        odPotential,
      };

      return {
        time,
        pressureLevels,
        surface,
        derived,
      };
    });

    return {
      latitude: data.latitude,
      longitude: data.longitude,
      elevation: data.elevation,
      timezone: data.timezone,
      fetchedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      hours,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch atmospheric profile: ${error.message}`);
    }
    throw new Error('Failed to fetch atmospheric profile: Unknown error');
  }
}

/**
 * Result type for atmospheric profile fetch that includes cache metadata
 */
export interface AtmosphericProfileResult {
  profile: AtmosphericProfile;
  /** True if the profile was fetched from cache due to API failure */
  isStale: boolean;
  /** Age of cached data in hours, if applicable */
  cacheAgeHours?: number;
  /** Error message if fetch failed and cache was used */
  error?: string;
}

/**
 * Gets cached atmospheric profile or fetches fresh data if cache is stale/missing
 * Falls back to stale cache if API fails (graceful degradation)
 * @param latitude - Location latitude
 * @param longitude - Location longitude
 * @param days - Number of forecast days (default 2)
 * @returns Atmospheric profile result with cache metadata
 */
export async function getAtmosphericProfile(
  latitude: number,
  longitude: number,
  days: number = 2,
): Promise<AtmosphericProfileResult> {
  // Use injected DB for CF Workers compatibility
  const db = _injectedDb;
  if (!db) {
    throw new Error(
      'Profile DB not initialized. Call setProfileDb(getDb(env)) before using profile functions.',
    );
  }
  const { atmosphericProfilesCache } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const now = new Date();

  // Create cache key from rounded coordinates (2 decimal precision ~1km)
  const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;

  // Try to get cached profile (both fresh and stale)
  const [cachedRow] = await db
    .select()
    .from(atmosphericProfilesCache)
    .where(
      and(
        eq(atmosphericProfilesCache.locationKey, cacheKey),
        eq(atmosphericProfilesCache.fetchDate, today),
      ),
    )
    .limit(1);

  // Check if cache exists and is still valid
  if (cachedRow && new Date(cachedRow.expiresAt) > now) {
    return {
      profile: cachedRow.data as AtmosphericProfile,
      isStale: false,
    };
  }

  // Try to fetch fresh data
  try {
    const freshProfile = await fetchAtmosphericProfile(latitude, longitude, days);

    // Store in cache (upsert pattern)
    await db
      .insert(atmosphericProfilesCache)
      .values({
        locationKey: cacheKey,
        fetchDate: today,
        data: freshProfile,
        fetchedAt: new Date(freshProfile.fetchedAt),
        expiresAt: new Date(freshProfile.expiresAt),
      })
      .onConflictDoUpdate({
        target: [atmosphericProfilesCache.locationKey, atmosphericProfilesCache.fetchDate],
        set: {
          data: freshProfile,
          fetchedAt: new Date(freshProfile.fetchedAt),
          expiresAt: new Date(freshProfile.expiresAt),
        },
      });

    return {
      profile: freshProfile,
      isStale: false,
    };
  } catch (error) {
    // API fetch failed - try to use stale cache
    if (cachedRow) {
      const cacheAgeHours = Math.round(
        (now.getTime() - new Date(cachedRow.fetchedAt).getTime()) / (1000 * 60 * 60),
      );

      console.warn(
        `Open-Meteo API failed, using stale cache (${cacheAgeHours}h old):`,
        error instanceof Error ? error.message : 'Unknown error',
      );

      return {
        profile: cachedRow.data as AtmosphericProfile,
        isStale: true,
        cacheAgeHours,
        error: error instanceof Error ? error.message : 'Failed to fetch fresh data',
      };
    }

    // No cache available - rethrow error
    throw error;
  }
}
