// Atmospheric profile data service using Open-Meteo pressure-level API
// Fetches full vertical atmospheric profiles for windgram visualizations

import type { DrizzleD1Database } from 'drizzle-orm/d1';

// DB injection for CF Workers compatibility
let _injectedDb: DrizzleD1Database<Record<string, unknown>> | null = null;

export function setProfileDb(db: DrizzleD1Database<Record<string, unknown>>) {
  _injectedDb = db;
}

const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_DURATION_HOURS = 3;

// Pressure levels to fetch (hPa): every 25 hPa (about 250 m) up to 700 hPa,
// where pilots fly, so the windgram resolves inversions and launch-height
// wind instead of averaging over 500 m to 1 km layers.
const PRESSURE_LEVELS = [
  1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700, 650, 600, 500,
] as const;

// Wind shear is judged between these levels, the 50-100 hPa steps its
// thresholds were set on, not between every fetched level.
const SHEAR_LEVELS: readonly number[] = [1000, 950, 900, 850, 800, 700];

/**
 * Every profile is fetched and cached for this many days, whatever the
 * caller asks for: Open-Meteo charges a 7-day call the same as a 1-day one,
 * and one cache row per place then serves every page.
 */
export const PROFILE_DAYS = 7;
const RETRY_DELAY_MS = 1500;
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
  // Optional so profiles cached before these were fetched still load
  dewPoint?: number | null; // °C at 2 m
  precipitation?: number | null; // mm in the preceding hour
  cloudCoverLow?: number | null; // %
  visibility?: number | null; // meters
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
  // Average height of the model's grid cell (fetched with elevation=nan), so
  // surface values, boundary-layer height and cloud base share one ground.
  elevation: number; // meters
  timezone: string;
  fetchedAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  sunriseByDay?: Record<string, string>; // YYYY-MM-DD -> local ISO time
  sunsetByDay?: Record<string, string>; // YYYY-MM-DD -> local ISO time
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
  daily?: {
    time: string[];
    sunrise: string[];
    sunset: string[];
  };
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
    dew_point_2m?: (number | null)[];
    precipitation?: (number | null)[];
    cloud_cover_low?: (number | null)[];
    visibility?: (number | null)[];
  } & {
    // Pressure-level parameters: one series per level and parameter
    [K in `${'temperature' | 'wind_speed' | 'wind_direction' | 'relative_humidity' | 'geopotential_height'}_${PressureLevelValue}hPa`]: number[];
  } & {
    [K in `cloud_cover_${PressureLevelValue}hPa`]: (number | null)[];
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
 * Estimates cumulus cloud base above the ground from the surface
 * temperature-dewpoint spread: a rising thermal reaches saturation about
 * 125 m higher for every °C of spread.
 * @returns Cloud base in meters AGL
 */
export function estimateCloudBaseFromDewpoint(temperature: number, dewPoint: number): number {
  return Math.max(0, Math.round(125 * (temperature - dewPoint)));
}

/** Fraction of incoming shortwave that heats the air as sensible heat over land (a typical midday value). */
const SENSIBLE_HEAT_FRACTION = 0.3;
/** Air density × specific heat (J/m³K), converting W/m² to a kinematic heat flux in K·m/s. */
const RHO_CP = 1200;

/**
 * Convective velocity scale W* (Deardorff), the typical thermal updraft
 * speed RASP and SkySight report: W* = (g/T × BLH × surface heat flux)^(1/3).
 * Open-Meteo has no sensible heat flux, so it is estimated as a fixed
 * fraction of the shortwave radiation reaching the ground.
 * @param blh - Boundary layer height above ground (m)
 * @param shortwaveRadiation - Incoming shortwave at the surface (W/m²)
 * @param temperature - Surface air temperature (°C)
 * @returns W* in m/s, or null when there is no boundary layer or no sun
 */
export function calculateWStar(
  blh: number | null,
  shortwaveRadiation: number | null,
  temperature: number,
): number | null {
  if (blh === null || blh <= 0 || shortwaveRadiation === null || shortwaveRadiation <= 0) {
    return null;
  }
  const heatFlux = (SENSIBLE_HEAT_FRACTION * shortwaveRadiation) / RHO_CP;
  const wStar = Math.cbrt((9.81 / (temperature + 273.15)) * blh * heatFlux);
  return Math.round(wStar * 10) / 10;
}

/**
 * Estimates the top of usable lift: thermals stop at the top of the
 * boundary layer, or at cloud base when cumulus forms below it.
 * @param blh - Boundary layer height above ground (m)
 * @param cloudBaseAgl - Cumulus cloud base above ground (m), or null
 * @param groundElevation - Ground height the AGL values are measured from (m MSL)
 * @returns Top of lift in meters MSL, or null if there is no boundary layer
 */
export function estimateTopOfLift(
  blh: number | null,
  cloudBaseAgl: number | null,
  groundElevation: number,
): number | null {
  if (blh === null || blh <= 0) return null;
  const top = cloudBaseAgl !== null ? Math.min(blh, cloudBaseAgl) : blh;
  return Math.round(groundElevation + top);
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
  // Soaring layer, 1000-700 hPa, at the levels the shear thresholds expect
  const soaringLevels = pressureLevels.filter((l) => SHEAR_LEVELS.includes(l.pressure));
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
    'dew_point_2m',
    'precipitation',
    'cloud_cover_low',
    'visibility',
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
    daily: 'sunrise,sunset',
    forecast_days: days.toString(),
    timezone: 'auto',
    // Use the model grid cell's own height instead of downscaling to the
    // point's terrain, so 10 m wind, boundary-layer height and the
    // pressure levels all refer to the same ground.
    elevation: 'nan',
  });

  const url = `${OPEN_METEO_BASE_URL}?${params.toString()}`;

  try {
    let response = await fetch(url);
    // Open-Meteo answers 429 when its free per-minute limit is hit, and
    // shared IPs (Workers, CI) hit it in bursts: wait a moment and retry once.
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      response = await fetch(url);
    }

    if (!response.ok) {
      // Open-Meteo explains a rejected request in the body: {"error":true,"reason":"..."}
      const reason = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(
        `Open-Meteo API error: ${response.status} ${response.statusText} ${reason}`.trim(),
      );
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
        dewPoint: data.hourly.dew_point_2m?.[idx] ?? null,
        precipitation: data.hourly.precipitation?.[idx] ?? null,
        cloudCoverLow: data.hourly.cloud_cover_low?.[idx] ?? null,
        visibility: data.hourly.visibility?.[idx] ?? null,
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

      // Cloud base above the model ground, from the surface dewpoint spread
      const cloudBase =
        surface.dewPoint != null
          ? estimateCloudBaseFromDewpoint(surface.temperature, surface.dewPoint)
          : null;

      // Calculate thermal index
      const thermalIndex = calculateThermalIndex(
        lapseRate,
        surface.cape,
        surface.convectiveInhibition,
        surface.windSpeed,
      );

      // Estimate top of lift
      const topOfLift = estimateTopOfLift(surface.boundaryLayerHeight, cloudBase, data.elevation);

      // W* (thermal updraft velocity)
      const wStar = calculateWStar(
        surface.boundaryLayerHeight,
        surface.shortwaveRadiation,
        surface.temperature,
      );

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
      sunriseByDay: data.daily
        ? Object.fromEntries(data.daily.time.map((d, i) => [d, data.daily!.sunrise[i]]))
        : undefined,
      sunsetByDay: data.daily
        ? Object.fromEntries(data.daily.time.map((d, i) => [d, data.daily!.sunset[i]]))
        : undefined,
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

/** Cache key for a location: coordinates rounded to 2 decimals (~1 km). */
export function profileLocationKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
}

/** The forecast days a profile covers, in order (local dates at the place). */
export function profileDates(profile: AtmosphericProfile): string[] {
  return [...new Set(profile.hours.map((h) => h.time.slice(0, 10)))];
}

/** Today's date (YYYY-MM-DD) where the profile is, from its time zone. */
export function profileToday(profile: AtmosphericProfile, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: profile.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * The profile from the place's today onward, at most `days` days: a profile
 * cached late yesterday still starts with yesterday.
 */
export function trimProfileDays(
  profile: AtmosphericProfile,
  days: number,
  now: Date = new Date(),
): AtmosphericProfile {
  const today = profileToday(profile, now);
  const dates = profileDates(profile).filter((d) => d >= today);
  const keep = new Set(dates.slice(0, days));
  const pick = (byDay?: Record<string, string>) =>
    byDay ? Object.fromEntries(Object.entries(byDay).filter(([d]) => keep.has(d))) : undefined;
  return {
    ...profile,
    hours: profile.hours.filter((h) => keep.has(h.time.slice(0, 10))),
    sunriseByDay: pick(profile.sunriseByDay),
    sunsetByDay: pick(profile.sunsetByDay),
  };
}

/**
 * Whether a cache row can be served without refetching. Profiles cached
 * before sunrise/sunset were fetched lack fields the forecast engine needs,
 * and rows from before PROFILE_DAYS can hold a single day. A week fetched
 * before the place's midnight still serves its remaining days until it
 * expires: refetching it on every request would burn Open-Meteo's quota
 * wherever its idea of the local date differs from ours.
 */
export function isCachedProfileFresh(
  row: { data: unknown; expiresAt: Date },
  days: number,
  now: Date = new Date(),
): boolean {
  const cached = row.data as AtmosphericProfile;
  return (
    new Date(row.expiresAt) > now &&
    !!cached.sunriseByDay &&
    profileDates(cached).length >= days &&
    profileDates(trimProfileDays(cached, days, now)).length >= days - 1
  );
}

/**
 * Gets the cached atmospheric profile, or fetches a fresh one when the cache
 * is stale, missing or shorter than PROFILE_DAYS. Falls back to the stale
 * cache if Open-Meteo fails.
 * @param days - Forecast days to return, from the place's today (default 2)
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

  const now = new Date();
  const today = now.toISOString().split('T')[0]; // the cache row's key: the UTC fetch date

  // Create cache key from rounded coordinates (2 decimal precision ~1km)
  const cacheKey = profileLocationKey(latitude, longitude);

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

  const fetchDays = Math.max(days, PROFILE_DAYS);
  if (cachedRow && isCachedProfileFresh(cachedRow, fetchDays, now)) {
    return {
      profile: trimProfileDays(cachedRow.data as AtmosphericProfile, days, now),
      isStale: false,
    };
  }

  // Try to fetch fresh data
  try {
    const freshProfile = await fetchAtmosphericProfile(latitude, longitude, fetchDays);

    // Store in cache (upsert pattern). A failed write, such as Turso
    // blocking writes, must not cost the pilot the profile we already have.
    try {
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
    } catch (cacheError) {
      console.error('Could not cache the atmospheric profile:', cacheError);
    }

    return {
      profile: trimProfileDays(freshProfile, days, now),
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
        profile: trimProfileDays(cachedRow.data as AtmosphericProfile, days, now),
        isStale: true,
        cacheAgeHours,
        error: error instanceof Error ? error.message : 'Failed to fetch fresh data',
      };
    }

    // No cache available - rethrow error
    throw error;
  }
}
