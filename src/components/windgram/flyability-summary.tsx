'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DayScore } from '@/types';
import type { AtmosphericProfile, AtmosphericHour } from '@/lib/weather-profile';

interface FlyabilitySummaryProps {
  dayScore: DayScore;
  atmosphericData: AtmosphericProfile;
  /**
   * Date to analyze (YYYY-MM-DD)
   */
  date: string;
}

/**
 * Displays an at-a-glance flyability assessment for pilots who don't want to
 * interpret the windgram themselves. Combines simple scoring with atmospheric
 * profile data for richer, plain-language assessments.
 */
export function FlyabilitySummary({ dayScore, atmosphericData, date }: FlyabilitySummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter hours for the target date and daylight hours (6 AM - 8 PM)
  const dayHours = atmosphericData.hours.filter((hour) => {
    const hourDate = hour.time.split('T')[0];
    const hourTime = parseInt(hour.time.split('T')[1].split(':')[0], 10);
    return hourDate === date && hourTime >= 6 && hourTime <= 20;
  });

  if (dayHours.length === 0) {
    return null; // No data for this day
  }

  // Analyze atmospheric data
  const analysis = analyzeDay(dayHours, dayScore);

  // Color classes for rating badges
  const ratingColors: Record<DayScore['label'], string> = {
    Epic: 'bg-purple-500 text-white',
    Great: 'bg-green-500 text-white',
    Good: 'bg-blue-500 text-white',
    Fair: 'bg-yellow-500 text-gray-900',
    Poor: 'bg-gray-400 text-gray-900',
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header with rating badge */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${ratingColors[dayScore.label]}`}
            >
              {dayScore.label}
            </span>
            {analysis.bestWindow && (
              <span className="text-sm text-muted-foreground">
                Best: <span className="font-medium text-foreground">{analysis.bestWindow}</span>
              </span>
            )}
          </div>

          {/* Plain-language summary */}
          <p className="text-sm leading-relaxed">{analysis.summary}</p>

          {/* Key concerns */}
          {analysis.concerns.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {analysis.concerns.map((concern, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center rounded-md bg-orange-100 dark:bg-orange-950 px-2 py-1 text-xs font-medium text-orange-700 dark:text-orange-300"
                >
                  {concern}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Expand/collapse button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-shrink-0 rounded-md p-2 hover:bg-muted transition-colors"
          aria-label={isExpanded ? 'Show less' : 'Show more details'}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="pt-3 border-t space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {/* Wind at launch altitude */}
            <div>
              <div className="text-muted-foreground text-xs">Launch Wind (avg)</div>
              <div className="font-medium">
                {analysis.launchWindSpeed} kt / {Math.round(analysis.launchWindSpeed * 1.15078)} mph
              </div>
              <div className="text-xs text-muted-foreground">{analysis.launchWindDirection}</div>
            </div>

            {/* Thermal strength */}
            <div>
              <div className="text-muted-foreground text-xs">Thermal Strength</div>
              <div className="font-medium">{analysis.thermalStrength}</div>
              <div className="text-xs text-muted-foreground">Index {analysis.avgThermalIndex}</div>
            </div>

            {/* Cloud base */}
            <div>
              <div className="text-muted-foreground text-xs">Cloud Base (est)</div>
              <div className="font-medium">
                {analysis.cloudBase !== null
                  ? `${analysis.cloudBase}m / ${Math.round(analysis.cloudBase * 3.28084)}ft`
                  : 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">AGL</div>
            </div>

            {/* Top of lift */}
            <div>
              <div className="text-muted-foreground text-xs">Top of Lift (est)</div>
              <div className="font-medium">
                {analysis.topOfLift !== null
                  ? `${analysis.topOfLift}m / ${Math.round(analysis.topOfLift * 3.28084)}ft`
                  : 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">MSL</div>
            </div>

            {/* Upper winds */}
            <div>
              <div className="text-muted-foreground text-xs">Upper Winds (850 hPa)</div>
              <div className="font-medium">{analysis.upperWindSpeed} kt</div>
              <div className="text-xs text-muted-foreground">{analysis.upperWindCategory}</div>
            </div>

            {/* Precipitation */}
            <div>
              <div className="text-muted-foreground text-xs">Rain Chance</div>
              <div className="font-medium">{analysis.precipChance}%</div>
              <div className="text-xs text-muted-foreground">
                {analysis.precipChance <= 10
                  ? 'Very low'
                  : analysis.precipChance <= 30
                    ? 'Low'
                    : analysis.precipChance <= 50
                      ? 'Moderate'
                      : 'High'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Analysis result interface
 */
interface DayAnalysis {
  summary: string;
  bestWindow: string | null;
  concerns: string[];
  launchWindSpeed: number;
  launchWindDirection: string;
  thermalStrength: string;
  avgThermalIndex: number;
  cloudBase: number | null;
  topOfLift: number | null;
  upperWindSpeed: number;
  upperWindCategory: string;
  precipChance: number;
}

/**
 * Analyzes a day's atmospheric data and generates a plain-language assessment
 */
function analyzeDay(hours: AtmosphericHour[], dayScore: DayScore): DayAnalysis {
  const concerns: string[] = [];

  // Calculate average launch-level wind (use 950 hPa as typical launch altitude)
  const launchWinds = hours.map((h) => {
    const level950 = h.pressureLevels.find((l) => l.pressure === 950);
    return {
      speed: level950?.windSpeed ?? h.surface.windSpeed,
      direction: level950?.windDirection ?? h.surface.windDirection,
    };
  });
  const avgLaunchWindSpeed = Math.round(
    (launchWinds.reduce((sum, w) => sum + w.speed, 0) / launchWinds.length) * 0.539957,
  ); // km/h to knots
  const avgLaunchWindDir = Math.round(
    launchWinds.reduce((sum, w) => sum + w.direction, 0) / launchWinds.length,
  );
  const launchWindDirection = degreesToCardinal(avgLaunchWindDir);

  // Check for increasing winds
  const earlyWinds = hours.slice(0, Math.floor(hours.length / 2));
  const lateWinds = hours.slice(Math.floor(hours.length / 2));
  const earlyAvgSpeed =
    earlyWinds.reduce((sum, h) => sum + h.surface.windSpeed, 0) / earlyWinds.length;
  const lateAvgSpeed =
    lateWinds.reduce((sum, h) => sum + h.surface.windSpeed, 0) / lateWinds.length;

  if (lateAvgSpeed > earlyAvgSpeed + 10) {
    const time = hours[Math.floor(hours.length / 2)].time.split('T')[1].split(':')[0];
    const timePeriod = formatHour(parseInt(time, 10));
    concerns.push(`Increasing winds after ${timePeriod}`);
  }

  // Check for strong winds
  if (avgLaunchWindSpeed > 20) {
    concerns.push('Strong winds');
  }

  // Calculate average thermal index
  const thermalIndices = hours
    .map((h) => h.derived.thermalIndex)
    .filter((t): t is number => t !== null);
  const avgThermalIndex =
    thermalIndices.length > 0
      ? Math.round(thermalIndices.reduce((sum, t) => sum + t, 0) / thermalIndices.length)
      : 0;

  const thermalStrength =
    avgThermalIndex >= 75
      ? 'Strong'
      : avgThermalIndex >= 50
        ? 'Moderate'
        : avgThermalIndex >= 25
          ? 'Weak'
          : 'Very weak';

  // Check for weak thermals
  if (avgThermalIndex < 40) {
    concerns.push('Weak thermals');
  }

  // Calculate average cloud base (AGL)
  const cloudBases = hours
    .map((h) => h.derived.estimatedCloudBase)
    .filter((c): c is number => c !== null);
  const avgCloudBase =
    cloudBases.length > 0
      ? Math.round(cloudBases.reduce((sum, c) => sum + c, 0) / cloudBases.length)
      : null;

  // Check for low cloud base
  if (avgCloudBase !== null && avgCloudBase < 800) {
    concerns.push('Low cloud base');
  }

  // Calculate average top of lift (MSL)
  const topOfLifts = hours
    .map((h) => h.derived.estimatedTopOfLift)
    .filter((t): t is number => t !== null);
  const avgTopOfLift =
    topOfLifts.length > 0
      ? Math.round(topOfLifts.reduce((sum, t) => sum + t, 0) / topOfLifts.length)
      : null;

  // Upper winds (850 hPa)
  const upperWinds = hours.map((h) => {
    const level850 = h.pressureLevels.find((l) => l.pressure === 850);
    return level850?.windSpeed ?? 0;
  });
  const avgUpperWindSpeed = Math.round(
    (upperWinds.reduce((sum, w) => sum + w, 0) / upperWinds.length) * 0.539957,
  ); // km/h to knots

  const upperWindCategory =
    avgUpperWindSpeed < 20
      ? 'Light'
      : avgUpperWindSpeed < 35
        ? 'Moderate'
        : avgUpperWindSpeed < 50
          ? 'Strong'
          : 'Very strong';

  // Check for strong upper winds
  if (avgUpperWindSpeed > 40) {
    concerns.push('Strong upper winds');
  }

  // Precipitation
  const avgPrecipChance = Math.round(
    hours.reduce((sum, h) => sum + h.surface.precipitationProbability, 0) / hours.length,
  );

  if (avgPrecipChance > 30) {
    concerns.push('Rain possible');
  }

  // Find best window (consecutive hours with thermal index > 50)
  const bestWindow = findBestWindow(hours);

  // Generate plain-language summary
  const summary = generateSummary(dayScore, avgThermalIndex, concerns, bestWindow);

  return {
    summary,
    bestWindow,
    concerns,
    launchWindSpeed: avgLaunchWindSpeed,
    launchWindDirection,
    thermalStrength,
    avgThermalIndex,
    cloudBase: avgCloudBase,
    topOfLift: avgTopOfLift,
    upperWindSpeed: avgUpperWindSpeed,
    upperWindCategory,
    precipChance: avgPrecipChance,
  };
}

/**
 * Finds the best flying window (consecutive hours with good conditions)
 */
function findBestWindow(hours: AtmosphericHour[]): string | null {
  if (hours.length === 0) return null;

  // Find longest consecutive stretch with thermal index > 50
  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;
  let currentLength = 0;

  hours.forEach((hour, idx) => {
    const thermalIndex = hour.derived.thermalIndex ?? 0;

    if (thermalIndex > 50) {
      if (currentStart === -1) {
        currentStart = idx;
        currentLength = 1;
      } else {
        currentLength++;
      }
    } else {
      if (currentLength > bestLength) {
        bestStart = currentStart;
        bestLength = currentLength;
      }
      currentStart = -1;
      currentLength = 0;
    }
  });

  // Check final stretch
  if (currentLength > bestLength) {
    bestStart = currentStart;
    bestLength = currentLength;
  }

  // Need at least 2 hours for a window
  if (bestLength < 2) {
    return null;
  }

  const startHour = parseInt(hours[bestStart].time.split('T')[1].split(':')[0], 10);
  const endHour = parseInt(hours[bestStart + bestLength - 1].time.split('T')[1].split(':')[0], 10);

  return `${formatHour(startHour)}-${formatHour(endHour)}`;
}

/**
 * Generates a plain-language summary of the day's conditions
 */
function generateSummary(
  dayScore: DayScore,
  avgThermalIndex: number,
  concerns: string[],
  bestWindow: string | null,
): string {
  const rating = dayScore.label;

  // Base message on rating
  let summary = '';

  switch (rating) {
    case 'Epic':
      summary = '🎉 Exceptional soaring conditions! ';
      if (bestWindow) {
        summary += `Prime XC window ${bestWindow}. `;
      }
      summary += 'Get to launch early!';
      break;

    case 'Great':
      summary = '✨ Excellent flying day! ';
      if (bestWindow) {
        summary += `Best window ${bestWindow}. `;
      }
      if (concerns.length === 0) {
        summary += 'Conditions look ideal.';
      }
      break;

    case 'Good':
      summary = 'Good flyable day. ';
      if (bestWindow) {
        summary += `Look for the window ${bestWindow}. `;
      }
      if (avgThermalIndex >= 60) {
        summary += 'Thermals should be workable.';
      }
      break;

    case 'Fair':
      summary = 'Marginal but flyable. ';
      if (avgThermalIndex < 40) {
        summary += 'Thermals may be weak. ';
      }
      if (bestWindow) {
        summary += `Best bet ${bestWindow}.`;
      } else {
        summary += 'Conditions could be challenging.';
      }
      break;

    case 'Poor':
      summary = 'Not recommended for flying. ';
      if (concerns.length > 0) {
        summary += 'Multiple unfavorable factors.';
      } else {
        summary += 'Conditions look unfavorable.';
      }
      break;
  }

  // Add concern-specific advice
  if (concerns.length > 0 && rating !== 'Poor') {
    if (concerns.includes('Strong winds') || concerns.includes('Strong upper winds')) {
      summary += ' Monitor wind speeds carefully.';
    } else if (concerns.includes('Weak thermals')) {
      summary += ' Expect lighter lift.';
    } else if (concerns.includes('Low cloud base')) {
      summary += ' Cloud base may limit altitude.';
    } else if (concerns.includes('Rain possible')) {
      summary += ' Check radar before launching.';
    }
  }

  return summary;
}

/**
 * Formats hour (24h) to 12h format
 */
function formatHour(hour: number): string {
  if (hour === 0) return '12AM';
  if (hour < 12) return `${hour}AM`;
  if (hour === 12) return '12PM';
  return `${hour - 12}PM`;
}

/**
 * Converts wind direction in degrees to cardinal direction
 */
function degreesToCardinal(degrees: number): string {
  const directions = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  const index = Math.round(((degrees % 360) / 360) * 16) % 16;
  return directions[index];
}
