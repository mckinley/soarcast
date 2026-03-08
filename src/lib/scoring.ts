// XC Soaring Score Algorithm
// Analyzes hourly weather data to score XC flying potential for each day

import { Forecast, Site, DayScore } from '@/types';
import type { AtmosphericProfile, AtmosphericHour } from '@/lib/weather-profile';

// Scoring weights (must sum to 100%)
const WEIGHTS = {
  CAPE: 0.25, // Thermal strength
  WIND_SPEED: 0.2, // Wind speed vs site max
  WIND_DIRECTION: 0.15, // Wind direction match
  CLOUD_COVER: 0.1, // Cloud cover
  PRECIPITATION: 0.05, // Precipitation probability
  BLH: 0.15, // Boundary layer height (thermal depth)
  UPPER_WIND: 0.1, // 850hPa wind (upper-level conditions)
};

// Flyable hours window (local time)
const FLYABLE_START_HOUR = 10;
const FLYABLE_END_HOUR = 17;

/**
 * Calculates XC soaring score for all days in a forecast
 * @param forecast - Weather forecast data
 * @param site - Site configuration
 * @returns Array of DayScore objects (one per day)
 */
export function calculateDailyScores(forecast: Forecast, site: Site): DayScore[] {
  const hourly = forecast.hourly;
  const scores: DayScore[] = [];

  // Group hourly data by day
  const dayData = groupHourlyDataByDay(hourly);

  // Score each day
  dayData.forEach((day) => {
    const dayScore = scoreSingleDay(day, site);
    scores.push(dayScore);
  });

  return scores;
}

/**
 * Groups hourly data into days for easier processing
 */
function groupHourlyDataByDay(hourly: Forecast['hourly']): DayData[] {
  const dayMap = new Map<string, HourlyDataPoint[]>();

  // Group hours by date
  hourly.time.forEach((timeStr, index) => {
    const date = timeStr.split('T')[0]; // Extract YYYY-MM-DD
    const hour = parseInt(timeStr.split('T')[1].split(':')[0], 10);

    // Only include flyable hours (10:00-17:00)
    if (hour >= FLYABLE_START_HOUR && hour <= FLYABLE_END_HOUR) {
      if (!dayMap.has(date)) {
        dayMap.set(date, []);
      }

      dayMap.get(date)!.push({
        hour,
        temperature: hourly.temperature_2m[index],
        windSpeed: hourly.wind_speed_10m[index],
        windDirection: hourly.wind_direction_10m[index],
        windGusts: hourly.wind_gusts_10m[index],
        cloudCover: hourly.cloud_cover[index],
        cape: hourly.cape[index],
        precipProbability: hourly.precipitation_probability[index],
        pressure: hourly.pressure_msl[index],
        boundaryLayerHeight: hourly.boundary_layer_height[index],
        windSpeed850hPa: hourly.wind_speed_850hPa[index],
        windDirection850hPa: hourly.wind_direction_850hPa[index],
        convectiveInhibition: hourly.convective_inhibition[index],
      });
    }
  });

  // Convert map to array
  const days: DayData[] = [];
  dayMap.forEach((hours, date) => {
    days.push({ date, hours });
  });

  return days;
}

/**
 * Scores a single day based on flyable hours
 */
function scoreSingleDay(day: DayData, site: Site): DayScore {
  if (day.hours.length === 0) {
    // No flyable hours data
    return createPoorScore(day.date);
  }

  // Calculate average values for flyable hours
  const avgCape = calculateAverage(day.hours.map((h) => h.cape ?? 0));
  const avgWindSpeed = calculateAverage(day.hours.map((h) => h.windSpeed));
  const avgWindDirection = calculateCircularMean(day.hours.map((h) => h.windDirection));
  const avgCloudCover = calculateAverage(day.hours.map((h) => h.cloudCover));
  const avgPrecipProb = calculateAverage(day.hours.map((h) => h.precipProbability));
  const avgBLH = calculateAverage(
    day.hours.map((h) => h.boundaryLayerHeight ?? null).filter((v): v is number => v !== null),
  );
  const avgUpperWind = calculateAverage(
    day.hours.map((h) => h.windSpeed850hPa ?? null).filter((v): v is number => v !== null),
  );

  // Score each factor (0-100)
  const capeScore = scoreCAPE(avgCape);
  const windSpeedScore = scoreWindSpeed(avgWindSpeed, site.maxWindSpeed);
  const windDirectionScore = scoreWindDirection(avgWindDirection, site.idealWindDirections);
  const cloudCoverScore = scoreCloudCover(avgCloudCover);
  const precipScore = scorePrecipitation(avgPrecipProb);
  const blhScore = scoreBoundaryLayerHeight(avgBLH);
  const upperWindScore = scoreUpperWind(avgUpperWind);

  // Calculate weighted overall score
  const overallScore =
    capeScore * WEIGHTS.CAPE +
    windSpeedScore * WEIGHTS.WIND_SPEED +
    windDirectionScore * WEIGHTS.WIND_DIRECTION +
    cloudCoverScore * WEIGHTS.CLOUD_COVER +
    precipScore * WEIGHTS.PRECIPITATION +
    blhScore * WEIGHTS.BLH +
    upperWindScore * WEIGHTS.UPPER_WIND;

  // Round to nearest integer
  const finalScore = Math.round(overallScore);

  return {
    date: day.date,
    overallScore: finalScore,
    label: scoreToLabel(finalScore),
    factors: {
      cape: Math.round(capeScore),
      windSpeed: Math.round(windSpeedScore),
      windDirection: Math.round(windDirectionScore),
      cloudCover: Math.round(cloudCoverScore),
      precipitation: Math.round(precipScore),
      blh: Math.round(blhScore),
      upperWind: Math.round(upperWindScore),
    },
  };
}

/**
 * Scores boundary layer height (BLH)
 * Higher BLH = deeper thermals = better XC potential
 * Typical range: 0-3000m
 * Uses neutral score (50) if no data available
 */
function scoreBoundaryLayerHeight(blh: number): number {
  if (isNaN(blh) || blh === 0) return 50; // Neutral score if missing

  if (blh <= 0) return 0;
  if (blh >= 500) {
    if (blh >= 2000) return 100;
    if (blh >= 1500) return 80;
    if (blh >= 1000) return 60;
    return 30; // 500-1000m
  }
  // Linear interpolation for 0-500m
  return (blh / 500) * 30;
}

/**
 * Scores 850hPa wind speed
 * Lower upper-level wind = safer XC flying
 * Typical range: 0-100+ km/h
 * Uses neutral score (50) if no data available
 */
function scoreUpperWind(windSpeed: number): number {
  if (isNaN(windSpeed)) return 50; // Neutral score if missing

  if (windSpeed < 20) return 100;
  if (windSpeed < 40) return 70;
  if (windSpeed < 60) return 40;
  if (windSpeed < 80) return 20;
  return 0; // >80 km/h - dangerous
}

/**
 * Scores CAPE (Convective Available Potential Energy)
 * Higher CAPE = stronger thermals = better score
 * Typical values: 0-3000 J/kg
 */
function scoreCAPE(cape: number): number {
  if (cape <= 0) return 0;
  if (cape >= 2000) return 100;

  // Linear scale: 0 J/kg = 0, 2000 J/kg = 100
  return (cape / 2000) * 100;
}

/**
 * Scores wind speed relative to site maximum
 * Wind below 50% of max = excellent
 * Wind approaching max = poor
 */
function scoreWindSpeed(windSpeed: number, maxWindSpeed: number): number {
  if (maxWindSpeed <= 0) return 50; // No max defined, neutral score

  const ratio = windSpeed / maxWindSpeed;

  if (ratio <= 0.3) return 100; // Very light wind
  if (ratio <= 0.5) return 90; // Ideal wind
  if (ratio <= 0.7) return 70; // Moderate wind
  if (ratio <= 0.85) return 40; // Strong wind
  if (ratio <= 1.0) return 20; // At the limit
  return 0; // Over the limit
}

/**
 * Scores wind direction match to ideal directions
 * Closer to ideal = better score
 */
function scoreWindDirection(windDirection: number, idealDirections: number[]): number {
  if (idealDirections.length === 0) return 50; // No ideal defined, neutral score

  // Find the closest ideal direction
  let minDiff = 180; // Max possible difference
  idealDirections.forEach((idealDir) => {
    const diff = angleDifference(windDirection, idealDir);
    if (diff < minDiff) {
      minDiff = diff;
    }
  });

  // Score based on difference
  // 0-15 degrees = perfect (100)
  // 15-30 degrees = good (80)
  // 30-60 degrees = okay (50)
  // 60-90 degrees = poor (20)
  // >90 degrees = bad (0)
  if (minDiff <= 15) return 100;
  if (minDiff <= 30) return 80;
  if (minDiff <= 60) return 50;
  if (minDiff <= 90) return 20;
  return 0;
}

/**
 * Scores cloud cover
 * Low cloud cover = good (thermals can develop)
 * High cloud cover = poor (blocks sun, weak thermals)
 * Percentage scale: 0-100%
 */
function scoreCloudCover(cloudCover: number): number {
  if (cloudCover <= 20) return 100; // Clear skies
  if (cloudCover <= 40) return 80; // Mostly clear
  if (cloudCover <= 60) return 50; // Partly cloudy
  if (cloudCover <= 80) return 30; // Mostly cloudy
  return 10; // Overcast
}

/**
 * Scores precipitation probability
 * Low probability = good
 * High probability = poor
 * Percentage scale: 0-100%
 */
function scorePrecipitation(precipProbability: number): number {
  if (precipProbability <= 10) return 100; // No rain expected
  if (precipProbability <= 30) return 70; // Low chance
  if (precipProbability <= 50) return 40; // Moderate chance
  if (precipProbability <= 70) return 20; // High chance
  return 0; // Very high chance
}

/**
 * Converts numeric score to label
 */
export function scoreToLabel(score: number): DayScore['label'] {
  if (score >= 86) return 'Epic';
  if (score >= 71) return 'Great';
  if (score >= 51) return 'Good';
  if (score >= 31) return 'Fair';
  return 'Poor';
}

/**
 * Calculates average of an array of numbers
 */
function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calculates circular mean for wind directions
 * Properly handles the circular nature of angles (0° = 360°)
 * Uses vector averaging: mean of sin/cos components converted back to angle
 */
function calculateCircularMean(directions: number[]): number {
  if (directions.length === 0) return 0;

  // Convert degrees to radians and calculate mean of sin/cos components
  const sinSum = directions.reduce((sum, dir) => sum + Math.sin((dir * Math.PI) / 180), 0);
  const cosSum = directions.reduce((sum, dir) => sum + Math.cos((dir * Math.PI) / 180), 0);

  const sinMean = sinSum / directions.length;
  const cosMean = cosSum / directions.length;

  // Convert back to degrees using atan2
  let meanDir = (Math.atan2(sinMean, cosMean) * 180) / Math.PI;

  // Normalize to 0-360 range
  if (meanDir < 0) {
    meanDir += 360;
  }

  return meanDir;
}

/**
 * Calculates the smallest angle difference between two directions
 * Accounts for circular nature of compass (0 = 360)
 */
function angleDifference(dir1: number, dir2: number): number {
  const diff = Math.abs(dir1 - dir2);
  if (diff > 180) {
    return 360 - diff;
  }
  return diff;
}

/**
 * Creates a poor score for days with no data
 */
function createPoorScore(date: string): DayScore {
  return {
    date,
    overallScore: 0,
    label: 'Poor',
    factors: {
      cape: 0,
      windSpeed: 0,
      windDirection: 0,
      cloudCover: 0,
      precipitation: 0,
      blh: 0,
      upperWind: 0,
    },
  };
}

// ─────────────────────────────────────────────────
// Scoring v2: Profile-based scoring with W*, OD penalties, wind shear
// ─────────────────────────────────────────────────

// v2 weights (same total, W* replaces CAPE)
const WEIGHTS_V2 = {
  W_STAR: 0.25, // Thermal strength (replaces CAPE)
  WIND_SPEED: 0.2,
  WIND_DIRECTION: 0.15,
  CLOUD_COVER: 0.1,
  PRECIPITATION: 0.05,
  BLH: 0.15,
  UPPER_WIND: 0.1,
};

/**
 * Scores W* (thermal updraft velocity) on 0-100 scale
 * null/0 → 0, 1 m/s → 40, 2 m/s → 75, 3+ m/s → 100
 */
function scoreWStar(wStar: number | null): number {
  if (wStar === null || wStar <= 0) return 0;
  if (wStar >= 3) return 100;
  // Piecewise linear: 0→0, 1→40, 2→75, 3→100
  if (wStar <= 1) return wStar * 40;
  if (wStar <= 2) return 40 + (wStar - 1) * 35;
  return 75 + (wStar - 2) * 25;
}

/**
 * Determines the dynamic flyable window from sunrise/sunset
 * start = max(10:00, sunrise + 2h), end = min(19:00, sunset - 1.5h)
 */
function getFlyableWindow(
  sunrise: string,
  sunset: string,
): { startHour: number; endHour: number } {
  const sunriseHour = parseTimeToHour(sunrise);
  const sunsetHour = parseTimeToHour(sunset);

  const startHour = Math.max(10, sunriseHour + 2);
  const endHour = Math.min(19, sunsetHour - 1.5);

  return { startHour, endHour };
}

/**
 * Parses an ISO time string or "HH:MM" to decimal hours
 */
function parseTimeToHour(timeStr: string): number {
  // Handle ISO format "2024-01-01T06:30" or just "06:30"
  const match = timeStr.match(/(\d{2}):(\d{2})/);
  if (!match) return 12;
  return parseInt(match[1]) + parseInt(match[2]) / 60;
}

/**
 * Calculates XC soaring scores using AtmosphericProfile data (v2)
 * Uses W* instead of CAPE, dynamic flyable window, OD & shear penalties
 * @param profile - AtmosphericProfile with derived parameters
 * @param forecast - Forecast with sunrise/sunset data
 * @param site - Site configuration
 * @returns Array of DayScore objects with v2 fields populated
 */
export function calculateDailyScoresFromProfile(
  profile: AtmosphericProfile,
  forecast: Forecast,
  site: Site,
): DayScore[] {
  // Get sunrise/sunset for dynamic window
  const { startHour, endHour } = getFlyableWindow(forecast.sunrise, forecast.sunset);

  // Group profile hours by day
  const dayMap = new Map<string, AtmosphericHour[]>();
  for (const hour of profile.hours) {
    const date = hour.time.split('T')[0];
    const hourNum = parseInt(hour.time.slice(11, 13));
    if (hourNum >= startHour && hourNum <= endHour) {
      if (!dayMap.has(date)) dayMap.set(date, []);
      dayMap.get(date)!.push(hour);
    }
  }

  // Also group forecast hourly data by day for wind/cloud/precip scoring
  const forecastDayMap = new Map<string, HourlyDataPoint[]>();
  forecast.hourly.time.forEach((timeStr, index) => {
    const date = timeStr.split('T')[0];
    const hour = parseInt(timeStr.split('T')[1].split(':')[0], 10);
    if (hour >= startHour && hour <= endHour) {
      if (!forecastDayMap.has(date)) forecastDayMap.set(date, []);
      forecastDayMap.get(date)!.push({
        hour,
        temperature: forecast.hourly.temperature_2m[index],
        windSpeed: forecast.hourly.wind_speed_10m[index],
        windDirection: forecast.hourly.wind_direction_10m[index],
        windGusts: forecast.hourly.wind_gusts_10m[index],
        cloudCover: forecast.hourly.cloud_cover[index],
        cape: forecast.hourly.cape[index],
        precipProbability: forecast.hourly.precipitation_probability[index],
        pressure: forecast.hourly.pressure_msl[index],
        boundaryLayerHeight: forecast.hourly.boundary_layer_height[index],
        windSpeed850hPa: forecast.hourly.wind_speed_850hPa[index],
        windDirection850hPa: forecast.hourly.wind_direction_850hPa[index],
        convectiveInhibition: forecast.hourly.convective_inhibition[index],
      });
    }
  });

  const scores: DayScore[] = [];

  for (const [date, profileHours] of dayMap) {
    const forecastHours = forecastDayMap.get(date) || [];

    if (profileHours.length === 0) {
      scores.push(createPoorScore(date));
      continue;
    }

    // W* scoring (replaces CAPE)
    const wStarValues = profileHours.map((h) => h.derived.wStar);
    const peakWStar = Math.max(...wStarValues.filter((v): v is number => v !== null), 0);
    const avgWStar =
      wStarValues.filter((v): v is number => v !== null).reduce((a, b) => a + b, 0) /
      Math.max(1, wStarValues.filter((v) => v !== null).length);
    const wStarScore = scoreWStar(avgWStar);

    // Use forecast hours for remaining factors (same as v1)
    const avgWindSpeed = calculateAverage(forecastHours.map((h) => h.windSpeed));
    const avgWindDirection = calculateCircularMean(forecastHours.map((h) => h.windDirection));
    const avgCloudCover = calculateAverage(forecastHours.map((h) => h.cloudCover));
    const avgPrecipProb = calculateAverage(forecastHours.map((h) => h.precipProbability));
    const avgBLH = calculateAverage(
      forecastHours
        .map((h) => h.boundaryLayerHeight ?? null)
        .filter((v): v is number => v !== null),
    );
    const avgUpperWind = calculateAverage(
      forecastHours.map((h) => h.windSpeed850hPa ?? null).filter((v): v is number => v !== null),
    );

    const windSpeedScore = scoreWindSpeed(avgWindSpeed, site.maxWindSpeed);
    const windDirectionScore = scoreWindDirection(avgWindDirection, site.idealWindDirections);
    const cloudCoverScore = scoreCloudCover(avgCloudCover);
    const precipScore = scorePrecipitation(avgPrecipProb);
    const blhScore = scoreBoundaryLayerHeight(avgBLH);
    const upperWindScore = scoreUpperWind(avgUpperWind);

    // Weighted score
    let overallScore =
      wStarScore * WEIGHTS_V2.W_STAR +
      windSpeedScore * WEIGHTS_V2.WIND_SPEED +
      windDirectionScore * WEIGHTS_V2.WIND_DIRECTION +
      cloudCoverScore * WEIGHTS_V2.CLOUD_COVER +
      precipScore * WEIGHTS_V2.PRECIPITATION +
      blhScore * WEIGHTS_V2.BLH +
      upperWindScore * WEIGHTS_V2.UPPER_WIND;

    // OD penalty
    const avgOd =
      profileHours.reduce((sum, h) => sum + h.derived.odPotential, 0) / profileHours.length;
    let odRisk: DayScore['odRisk'] = 'none';
    if (avgOd >= 2.5) {
      overallScore -= 20;
      odRisk = 'high';
    } else if (avgOd >= 2) {
      overallScore -= 10;
      odRisk = 'moderate';
    } else if (avgOd >= 1) {
      odRisk = 'low';
    }

    // Wind shear penalty
    const maxShear = Math.max(
      ...profileHours.map((h) => h.derived.windShearMax ?? 0),
    );
    let windShear: DayScore['windShear'] = 'none';
    if (maxShear > 40) {
      overallScore -= 15;
      windShear = 'high';
    } else if (maxShear > 25) {
      overallScore -= 8;
      windShear = 'moderate';
    } else if (maxShear > 15) {
      windShear = 'low';
    }

    // Clamp to 0 minimum
    overallScore = Math.max(0, Math.round(overallScore));

    // Best window: find contiguous hours with best W*
    const bestWindowStr = findBestWindow(profileHours);

    // Freezing concern: freezing level below 3000m MSL
    const minFreezing = Math.min(
      ...profileHours
        .map((h) => h.derived.freezingLevel)
        .filter((v): v is number => v !== null),
      Infinity,
    );
    const freezingConcern = minFreezing < 3000;

    // Peak ceiling (top of lift)
    const peakCeiling = Math.max(
      ...profileHours
        .map((h) => h.derived.estimatedTopOfLift)
        .filter((v): v is number => v !== null),
      0,
    );

    scores.push({
      date,
      overallScore,
      label: scoreToLabel(overallScore),
      factors: {
        cape: Math.round(wStarScore), // W* replaces CAPE in factors
        windSpeed: Math.round(windSpeedScore),
        windDirection: Math.round(windDirectionScore),
        cloudCover: Math.round(cloudCoverScore),
        precipitation: Math.round(precipScore),
        blh: Math.round(blhScore),
        upperWind: Math.round(upperWindScore),
      },
      wStar: peakWStar > 0 ? Math.round(peakWStar * 10) / 10 : null,
      bestWindow: bestWindowStr,
      odRisk,
      windShear,
      freezingConcern,
      peakCeilingMsl: peakCeiling > 0 ? Math.round(peakCeiling) : null,
    });
  }

  return scores;
}

/**
 * Finds the best 2+ hour window with highest average W*
 * Returns formatted string like "12:00-16:00"
 */
function findBestWindow(hours: AtmosphericHour[]): string {
  if (hours.length === 0) return '';

  let bestStart = 0;
  let bestEnd = 0;
  let bestAvg = 0;

  // Sliding window: find best contiguous stretch
  for (let i = 0; i < hours.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i; j < hours.length; j++) {
      const ws = hours[j].derived.wStar ?? 0;
      sum += ws;
      count++;
      const avg = sum / count;
      if (count >= 2 && avg > bestAvg) {
        bestAvg = avg;
        bestStart = i;
        bestEnd = j;
      }
    }
  }

  if (bestAvg === 0) return '';

  const startTime = hours[bestStart].time.slice(11, 16);
  // End time is the end of the last hour (add 1 hour)
  const endHourNum = parseInt(hours[bestEnd].time.slice(11, 13)) + 1;
  const endTime = `${endHourNum.toString().padStart(2, '0')}:00`;

  return `${startTime}-${endTime}`;
}

// Type definitions for internal use
interface HourlyDataPoint {
  hour: number;
  temperature: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  cloudCover: number;
  cape: number | null;
  precipProbability: number;
  pressure: number;
  boundaryLayerHeight: number | null;
  windSpeed850hPa: number | null;
  windDirection850hPa: number | null;
  convectiveInhibition: number | null;
}

interface DayData {
  date: string;
  hours: HourlyDataPoint[];
}
