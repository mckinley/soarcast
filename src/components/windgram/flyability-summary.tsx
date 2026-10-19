'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DayScore } from '@/types';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import { deriveLaunchConditions } from '@/lib/forecast-engine/launch-conditions';
import { verdictSummary } from '@/lib/forecast-engine';
import { calculateCircularMean } from '@/lib/site-utils';

interface FlyabilitySummaryProps {
  dayScore: DayScore;
  atmosphericData: AtmosphericProfile;
  /**
   * Date to analyze (YYYY-MM-DD)
   */
  date: string;
  /** Launch altitude in meters MSL, so wind is shown where the pilot launches */
  launchElevation?: number;
}

/**
 * The engine's verdict for one day in plain language: can I fly, when, and
 * what stops me otherwise. The details show the conditions behind it.
 */
export function FlyabilitySummary({
  dayScore,
  atmosphericData,
  date,
  launchElevation = 0,
}: FlyabilitySummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hours = hoursToDescribe(atmosphericData, date, dayScore.flyableWindow);
  if (hours.length === 0) {
    return null; // No data for this day
  }
  const details = describeConditions(atmosphericData, hours, launchElevation);

  const ratingColors: Record<DayScore['label'], string> = {
    Epic: 'bg-purple-500 text-white',
    Great: 'bg-green-500 text-white',
    Good: 'bg-blue-500 text-white',
    Fair: 'bg-yellow-500 text-gray-900',
    Poor: 'bg-gray-400 text-gray-900',
  };
  const windowLabel = dayScore.verdict === 'go' ? 'Flyable' : 'Marginal';

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${ratingColors[dayScore.label]}`}
            >
              {dayScore.label}
            </span>
            {dayScore.flyableWindow && (
              <span className="text-sm text-muted-foreground">
                {windowLabel}:{' '}
                <span className="font-medium text-foreground">{dayScore.flyableWindow}</span>
              </span>
            )}
          </div>

          <p className="text-sm leading-relaxed">{verdictSummary(dayScore)}</p>

          {dayScore.reasons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {dayScore.reasons.map((reason) => (
                <span
                  key={reason}
                  className="inline-flex items-center rounded-md bg-orange-100 dark:bg-orange-950 px-2 py-1 text-xs font-medium text-orange-700 dark:text-orange-300"
                >
                  {reason}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-shrink-0 rounded-md p-2 hover:bg-muted transition-colors"
          aria-label={isExpanded ? 'Show less' : 'Show more details'}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="pt-3 border-t space-y-3">
          <p className="text-xs text-muted-foreground">
            {dayScore.flyableWindow
              ? `Averages for ${dayScore.flyableWindow}`
              : 'Averages for the daylight hours'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Wind at Launch</div>
              <div className="font-medium">
                {details.launchWindKmh} km/h / {Math.round(details.launchWindKmh * 0.621371)} mph
              </div>
              <div className="text-xs text-muted-foreground">{details.launchWindDirection}</div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">Thermal Strength</div>
              <div className="font-medium">
                {dayScore.wStar != null ? `${dayScore.wStar} m/s` : 'None'}
              </div>
              <div className="text-xs text-muted-foreground">
                {thermalLabel(dayScore.wStar ?? null)}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">Cloud Base (est)</div>
              <div className="font-medium">
                {details.cloudBaseMsl !== null
                  ? `${details.cloudBaseMsl}m / ${Math.round(details.cloudBaseMsl * 3.28084)}ft`
                  : 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">MSL</div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">Top of Lift (est)</div>
              <div className="font-medium">
                {dayScore.peakCeilingMsl != null
                  ? `${dayScore.peakCeilingMsl}m / ${Math.round(dayScore.peakCeilingMsl * 3.28084)}ft`
                  : 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">
                {dayScore.topOfLiftAboveLaunch != null
                  ? `${dayScore.topOfLiftAboveLaunch} m above launch`
                  : 'MSL'}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">Upper Winds (850 hPa)</div>
              <div className="font-medium">{details.upperWindKmh} km/h</div>
              <div className="text-xs text-muted-foreground">
                {details.upperWindKmh < 35
                  ? 'Light'
                  : details.upperWindKmh < 65
                    ? 'Moderate'
                    : details.upperWindKmh < 90
                      ? 'Strong'
                      : 'Very strong'}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">Rain Chance (max)</div>
              <div className="font-medium">{details.maxPrecipChance}%</div>
              <div className="text-xs text-muted-foreground">
                {details.maxPrecipChance <= 10
                  ? 'Very low'
                  : details.maxPrecipChance <= 30
                    ? 'Low'
                    : details.maxPrecipChance <= 50
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

/** The flyable window's hours, or the day's daylight hours when there is none. */
function hoursToDescribe(profile: AtmosphericProfile, date: string, window: string | null) {
  const dayHours = profile.hours.filter((h) => h.time.startsWith(date));
  const hourOf = (time: string) => parseInt(time.slice(11, 13), 10);
  if (window) {
    const [start, end] = window.split('-').map((t) => parseInt(t, 10));
    return dayHours.filter((h) => hourOf(h.time) >= start && hourOf(h.time) < end);
  }
  const sunrise = profile.sunriseByDay?.[date];
  const sunset = profile.sunsetByDay?.[date];
  const first = sunrise ? hourOf(sunrise) : 6;
  const last = sunset ? hourOf(sunset) : 20;
  return dayHours.filter((h) => hourOf(h.time) >= first && hourOf(h.time) <= last);
}

function describeConditions(
  profile: AtmosphericProfile,
  hours: AtmosphericProfile['hours'],
  launchElevation: number,
) {
  const average = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

  const atLaunch = hours.map((h) => deriveLaunchConditions(h, profile.elevation, launchElevation));
  const cloudBases = atLaunch.map((c) => c.cloudBaseMsl).filter((v): v is number => v !== null);
  const upperWinds = hours.map(
    (h) => h.pressureLevels.find((l) => l.pressure === 850)?.windSpeed ?? 0,
  );

  return {
    launchWindKmh: Math.round(average(atLaunch.map((c) => c.windSpeed))),
    launchWindDirection: degreesToCardinal(
      calculateCircularMean(atLaunch.map((c) => c.windDirection)),
    ),
    cloudBaseMsl: cloudBases.length > 0 ? Math.round(average(cloudBases)) : null,
    upperWindKmh: Math.round(average(upperWinds)),
    maxPrecipChance: Math.max(0, ...atLaunch.map((c) => c.precipitationProbability)),
  };
}

function thermalLabel(wStar: number | null): string {
  if (wStar === null || wStar < 0.5) return 'No usable thermals';
  if (wStar < 1.2) return 'Weak';
  if (wStar < 2) return 'Moderate';
  if (wStar < 3) return 'Strong';
  return 'Very strong';
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
