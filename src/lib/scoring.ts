// XC Soaring Score Algorithm
// Analyzes hourly weather data to score XC flying potential for each day

import { Forecast, Site, DayScore } from '@/types';

// Scoring weights (must sum to 100%)
const WEIGHTS = {
  CAPE: 0.3, // Thermal strength - most important
  WIND_SPEED: 0.25, // Wind speed vs site max
  WIND_DIRECTION: 0.2, // Wind direction match
  CLOUD_COVER: 0.15, // Cloud cover
  PRECIPITATION: 0.1, // Precipitation probability
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
export function calculateDailyScores(
  forecast: Forecast,
  site: Site
): DayScore[] {
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
  const avgWindDirection = calculateAverage(day.hours.map((h) => h.windDirection));
  const avgCloudCover = calculateAverage(day.hours.map((h) => h.cloudCover));
  const avgPrecipProb = calculateAverage(
    day.hours.map((h) => h.precipProbability)
  );

  // Score each factor (0-100)
  const capeScore = scoreCAPE(avgCape);
  const windSpeedScore = scoreWindSpeed(avgWindSpeed, site.maxWindSpeed);
  const windDirectionScore = scoreWindDirection(
    avgWindDirection,
    site.idealWindDirections
  );
  const cloudCoverScore = scoreCloudCover(avgCloudCover);
  const precipScore = scorePrecipitation(avgPrecipProb);

  // Calculate weighted overall score
  const overallScore =
    capeScore * WEIGHTS.CAPE +
    windSpeedScore * WEIGHTS.WIND_SPEED +
    windDirectionScore * WEIGHTS.WIND_DIRECTION +
    cloudCoverScore * WEIGHTS.CLOUD_COVER +
    precipScore * WEIGHTS.PRECIPITATION;

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
    },
  };
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
function scoreWindDirection(
  windDirection: number,
  idealDirections: number[]
): number {
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
function scoreToLabel(score: number): DayScore['label'] {
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
}

interface DayData {
  date: string;
  hours: HourlyDataPoint[];
}
