// XC Soaring Score Algorithm
// Analyzes hourly weather data to score XC flying potential for each day

import { Forecast, Site, DayScore } from '@/types';

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
