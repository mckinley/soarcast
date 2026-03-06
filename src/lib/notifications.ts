// Smart notification generation using atmospheric profile data
// Provides plain-language, actionable flying alerts

import type { AtmosphericProfile, AtmosphericHour } from './weather-profile';
import type { Site } from '@/types';

/**
 * Analyzes a single day's atmospheric conditions and generates a plain-language notification
 */
export interface DayAnalysis {
  date: string; // YYYY-MM-DD
  rating: 'Poor' | 'Fair' | 'Good' | 'Great' | 'Epic';
  score: number; // 0-100
  bestWindow: string | null; // e.g., "11AM-2PM"
  concerns: string[]; // e.g., ["Strong winds above 3000ft", "Low cloud base"]
  highlights: string[]; // e.g., ["Light winds", "Deep thermals to 8000ft"]
  thermalStrength: string | null; // e.g., "moderate" | "strong" | "weak"
  cloudBase: string | null; // e.g., "~5000ft AGL"
  topOfLift: string | null; // e.g., "~8000ft MSL"
}

/**
 * Rich notification payload with atmospheric analysis
 */
export interface RichNotification {
  title: string;
  body: string;
  url: string;
  siteId: string;
  tag: string;
  analysis: DayAnalysis;
}

/**
 * Analyzes atmospheric profile data for a specific day and generates a comprehensive assessment
 */
export function analyzeFlyingDay(
  profile: AtmosphericProfile,
  site: Site,
  targetDate: string, // YYYY-MM-DD
): DayAnalysis | null {
  // Filter hours for the target date
  const dayHours = profile.hours.filter((hour) => hour.time.startsWith(targetDate));

  if (dayHours.length === 0) {
    return null;
  }

  // Focus on flyable hours (10:00-17:00 local time)
  const flyableHours = dayHours.filter((hour) => {
    const hourNum = parseInt(hour.time.split('T')[1].split(':')[0], 10);
    return hourNum >= 10 && hourNum <= 17;
  });

  if (flyableHours.length === 0) {
    return null;
  }

  // Calculate average metrics for flyable hours
  const avgThermalIndex =
    flyableHours.reduce((sum, h) => sum + (h.derived.thermalIndex ?? 0), 0) / flyableHours.length;

  const avgWindSpeed =
    flyableHours.reduce((sum, h) => sum + h.surface.windSpeed, 0) / flyableHours.length;

  const avgCape = flyableHours.reduce((sum, h) => sum + h.surface.cape, 0) / flyableHours.length;

  const avgLapseRate =
    flyableHours.reduce((sum, h) => sum + (h.derived.lapseRate ?? 0), 0) / flyableHours.length;

  // Find the best flying window (consecutive hours with thermalIndex > 60)
  const bestWindow = findBestWindow(flyableHours);

  // Analyze concerns and highlights
  const concerns: string[] = [];
  const highlights: string[] = [];

  // Wind analysis
  const maxGusts = Math.max(...flyableHours.map((h) => h.surface.windGusts));

  if (avgWindSpeed < site.maxWindSpeed * 0.5) {
    highlights.push(`Light winds (~${Math.round(avgWindSpeed)}km/h)`);
  } else if (avgWindSpeed > site.maxWindSpeed * 0.85) {
    concerns.push(
      `Strong winds (~${Math.round(avgWindSpeed)}km/h, limit ${site.maxWindSpeed}km/h)`,
    );
  }

  if (maxGusts > site.maxWindSpeed) {
    concerns.push(`Gusts exceeding site limit (${Math.round(maxGusts)}km/h)`);
  }

  // Wind direction analysis
  const windDirections = flyableHours.map((h) => h.surface.windDirection);
  const avgWindDirection = calculateCircularMean(windDirections);
  const directionMatch = checkWindDirectionMatch(avgWindDirection, site.idealWindDirections);

  if (directionMatch.score >= 80) {
    highlights.push(`${directionMatch.label} winds (${Math.round(avgWindDirection)}°)`);
  } else if (directionMatch.score < 50) {
    concerns.push(`Non-ideal wind direction (${Math.round(avgWindDirection)}°)`);
  }

  // Thermal analysis
  const thermalStrength = classifyThermalStrength(avgCape, avgLapseRate);

  if (avgCape > 1000) {
    highlights.push(`Strong thermals (CAPE ${Math.round(avgCape)} J/kg)`);
  } else if (avgCape < 300) {
    concerns.push('Weak thermal activity');
  }

  // Cloud base and top of lift
  const avgCloudBase = calculateAverage(
    flyableHours.map((h) => h.derived.estimatedCloudBase).filter((v): v is number => v !== null),
  );
  const avgTopOfLift = calculateAverage(
    flyableHours.map((h) => h.derived.estimatedTopOfLift).filter((v): v is number => v !== null),
  );

  const cloudBaseStr = avgCloudBase ? `~${Math.round(avgCloudBase * 3.28084)}ft AGL` : null;

  const topOfLiftStr = avgTopOfLift ? `~${Math.round(avgTopOfLift * 3.28084)}ft MSL` : null;

  if (avgCloudBase && avgCloudBase < 300) {
    concerns.push('Very low cloud base');
  } else if (avgTopOfLift && avgTopOfLift > 2500) {
    highlights.push(`Deep thermals to ${topOfLiftStr}`);
  }

  // Precipitation check
  const maxPrecipProb = Math.max(...flyableHours.map((h) => h.surface.precipitationProbability));
  if (maxPrecipProb > 30) {
    concerns.push(`${Math.round(maxPrecipProb)}% chance of rain`);
  }

  // Calculate overall score and rating
  const score = calculateOverallScore(
    avgThermalIndex,
    avgWindSpeed,
    site.maxWindSpeed,
    directionMatch.score,
    maxPrecipProb,
  );

  const rating = scoreToRating(score);

  return {
    date: targetDate,
    rating,
    score,
    bestWindow,
    concerns,
    highlights,
    thermalStrength,
    cloudBase: cloudBaseStr,
    topOfLift: topOfLiftStr,
  };
}

/**
 * Generates a plain-language notification from day analysis
 */
export function generateNotification(site: Site, analysis: DayAnalysis): RichNotification {
  const { rating, date, bestWindow, highlights, concerns } = analysis;

  // Format date as "tomorrow" or "Wednesday"
  const dateLabel = formatDateLabel(date);

  // Build title
  const title = `${rating} Flying Day: ${site.name}`;

  // Build body with key information
  const parts: string[] = [];

  // Add date and rating
  parts.push(`${site.name} looks ${rating} ${dateLabel}!`);

  // Add best window if available
  if (bestWindow) {
    parts.push(`Best thermals ${bestWindow}.`);
  }

  // Add top highlights (max 2)
  const topHighlights = highlights.slice(0, 2);
  if (topHighlights.length > 0) {
    parts.push(topHighlights.join(', ') + '.');
  }

  // Add key concerns (max 1)
  if (concerns.length > 0) {
    parts.push(`⚠️ ${concerns[0]}.`);
  }

  // Add cloud base if available
  if (analysis.cloudBase) {
    parts.push(`Cloud base ${analysis.cloudBase}.`);
  }

  const body = parts.join(' ');

  return {
    title,
    body,
    url: `/sites/${site.id}`,
    siteId: site.id,
    tag: `site-${site.id}-${date}`,
    analysis,
  };
}

/**
 * Finds the best flying window (consecutive hours with good conditions)
 */
function findBestWindow(hours: AtmosphericHour[]): string | null {
  if (hours.length === 0) return null;

  // Find consecutive hours with thermalIndex > 60
  let bestStart = -1;
  let bestEnd = -1;
  let bestScore = 0;

  let currentStart = -1;
  let currentScore = 0;

  for (let i = 0; i < hours.length; i++) {
    const thermalIndex = hours[i].derived.thermalIndex ?? 0;

    if (thermalIndex > 60) {
      if (currentStart === -1) {
        currentStart = i;
        currentScore = thermalIndex;
      } else {
        currentScore += thermalIndex;
      }
    } else {
      if (currentStart !== -1 && currentScore > bestScore) {
        bestStart = currentStart;
        bestEnd = i - 1;
        bestScore = currentScore;
      }
      currentStart = -1;
      currentScore = 0;
    }
  }

  // Check final window
  if (currentStart !== -1 && currentScore > bestScore) {
    bestStart = currentStart;
    bestEnd = hours.length - 1;
  }

  if (bestStart === -1) return null;

  // Format time window
  const startHour = parseInt(hours[bestStart].time.split('T')[1].split(':')[0], 10);
  const endHour = parseInt(hours[bestEnd].time.split('T')[1].split(':')[0], 10);

  return `${formatHour(startHour)}-${formatHour(endHour)}`;
}

/**
 * Classifies thermal strength based on CAPE and lapse rate
 */
function classifyThermalStrength(cape: number, lapseRate: number): string {
  if (cape > 1500 && lapseRate > 2.5) {
    return 'strong';
  } else if (cape > 800 && lapseRate > 2.0) {
    return 'moderate';
  } else if (cape > 300) {
    return 'weak';
  }
  return 'very weak';
}

/**
 * Checks wind direction match against ideal directions
 */
function checkWindDirectionMatch(
  windDirection: number,
  idealDirections: number[],
): { score: number; label: string } {
  if (idealDirections.length === 0) {
    return { score: 50, label: 'Variable' };
  }

  // Find closest ideal direction
  let minDiff = 180;
  idealDirections.forEach((idealDir) => {
    const diff = angleDifference(windDirection, idealDir);
    if (diff < minDiff) {
      minDiff = diff;
    }
  });

  // Score and label
  if (minDiff <= 15) {
    return { score: 100, label: 'Perfect' };
  } else if (minDiff <= 30) {
    return { score: 80, label: 'Good' };
  } else if (minDiff <= 60) {
    return { score: 50, label: 'Acceptable' };
  }
  return { score: 20, label: 'Cross' };
}

/**
 * Calculates overall flying score from multiple factors
 */
function calculateOverallScore(
  thermalIndex: number,
  windSpeed: number,
  maxWindSpeed: number,
  windDirectionScore: number,
  precipProb: number,
): number {
  // Thermal index contributes 40%
  const thermalScore = thermalIndex * 0.4;

  // Wind speed contributes 30%
  const windRatio = windSpeed / maxWindSpeed;
  const windScore = windRatio > 1 ? 0 : (1 - windRatio) * 100 * 0.3;

  // Wind direction contributes 20%
  const directionContribution = windDirectionScore * 0.2;

  // Precipitation contributes 10% (inverted)
  const precipScore = Math.max(0, (100 - precipProb) * 0.1);

  return Math.round(thermalScore + windScore + directionContribution + precipScore);
}

/**
 * Converts numeric score to rating label
 */
function scoreToRating(score: number): DayAnalysis['rating'] {
  if (score >= 86) return 'Epic';
  if (score >= 71) return 'Great';
  if (score >= 51) return 'Good';
  if (score >= 31) return 'Fair';
  return 'Poor';
}

/**
 * Formats date as "tomorrow", "today", or day name
 */
function formatDateLabel(dateStr: string): string {
  const target = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const targetTime = target.getTime();
  const todayTime = today.getTime();
  const tomorrowTime = tomorrow.getTime();

  if (targetTime === todayTime) {
    return 'today';
  } else if (targetTime === tomorrowTime) {
    return 'tomorrow';
  } else {
    // Return day name (e.g., "Wednesday")
    return target.toLocaleDateString('en-US', { weekday: 'long' });
  }
}

/**
 * Formats hour as 12-hour time (e.g., "2PM", "11AM")
 */
function formatHour(hour: number): string {
  if (hour === 0) return '12AM';
  if (hour === 12) return '12PM';
  if (hour < 12) return `${hour}AM`;
  return `${hour - 12}PM`;
}

/**
 * Calculates circular mean for wind directions
 */
function calculateCircularMean(directions: number[]): number {
  if (directions.length === 0) return 0;

  const sinSum = directions.reduce((sum, dir) => sum + Math.sin((dir * Math.PI) / 180), 0);
  const cosSum = directions.reduce((sum, dir) => sum + Math.cos((dir * Math.PI) / 180), 0);

  const sinMean = sinSum / directions.length;
  const cosMean = cosSum / directions.length;

  let meanDir = (Math.atan2(sinMean, cosMean) * 180) / Math.PI;

  if (meanDir < 0) {
    meanDir += 360;
  }

  return meanDir;
}

/**
 * Calculates the smallest angle difference between two directions
 */
function angleDifference(dir1: number, dir2: number): number {
  const diff = Math.abs(dir1 - dir2);
  if (diff > 180) {
    return 360 - diff;
  }
  return diff;
}

/**
 * Calculates average of an array of numbers
 */
function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Generates a morning digest notification summarizing all favorited sites
 */
export function generateMorningDigest(
  analyses: Array<{ site: Site; analysis: DayAnalysis }>,
  targetDate: string,
): RichNotification {
  // Filter to sites with Good or better rating
  const goodSites = analyses.filter((a) => ['Good', 'Great', 'Epic'].includes(a.analysis.rating));

  // Sort by score (best first)
  goodSites.sort((a, b) => b.analysis.score - a.analysis.score);

  const dateLabel = formatDateLabel(targetDate);

  if (goodSites.length === 0) {
    return {
      title: 'Daily Flying Forecast',
      body: `No great flying conditions ${dateLabel}. Check individual sites for details.`,
      url: '/dashboard',
      siteId: 'digest',
      tag: `digest-${targetDate}`,
      analysis: {
        date: targetDate,
        rating: 'Poor',
        score: 0,
        bestWindow: null,
        concerns: [],
        highlights: [],
        thermalStrength: null,
        cloudBase: null,
        topOfLift: null,
      },
    };
  }

  // Build summary
  const topSite = goodSites[0];
  const title =
    goodSites.length === 1
      ? `${topSite.analysis.rating} Flying ${dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}`
      : `${goodSites.length} Sites Look Good ${dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}`;

  const parts: string[] = [];

  // Add top site summary
  parts.push(`${topSite.site.name}: ${topSite.analysis.rating} (${topSite.analysis.score}/100).`);

  if (topSite.analysis.bestWindow) {
    parts.push(`Best ${topSite.analysis.bestWindow}.`);
  }

  // Add top highlights from the best site
  if (topSite.analysis.highlights.length > 0) {
    parts.push(topSite.analysis.highlights[0] + '.');
  }

  // Mention other good sites
  if (goodSites.length > 1) {
    const otherSites = goodSites.slice(1, 3).map((s) => s.site.name);
    parts.push(`Also good: ${otherSites.join(', ')}.`);
  }

  const body = parts.join(' ');

  return {
    title,
    body,
    url: '/dashboard',
    siteId: 'digest',
    tag: `digest-${targetDate}`,
    analysis: topSite.analysis,
  };
}
