'use client';

import type { AtmosphericHour } from '@/lib/weather-profile';
import { kmhToKnots } from './wind-barb-utils';

interface WindgramDetailPanelProps {
  hour: AtmosphericHour | null;
  altitude: number | null; // meters MSL
  isPinned: boolean;
  onClose: () => void;
  className?: string;
}

/**
 * Detail panel showing atmospheric data at a specific time and altitude
 * Used for hover/tap interactions on the windgram chart
 */
export function WindgramDetailPanel({
  hour,
  altitude,
  isPinned,
  onClose,
  className = '',
}: WindgramDetailPanelProps) {
  if (!hour || altitude === null) return null;

  // Find closest pressure level to the selected altitude
  // Use geopotential height to match altitude
  let closestLevel = hour.pressureLevels[0];
  let minDiff = Math.abs(closestLevel.geopotentialHeight - altitude);

  for (const level of hour.pressureLevels) {
    const diff = Math.abs(level.geopotentialHeight - altitude);
    if (diff < minDiff) {
      minDiff = diff;
      closestLevel = level;
    }
  }

  const { temperature, windSpeed, windDirection, relativeHumidity, pressure, geopotentialHeight } =
    closestLevel;

  // Format time
  const date = new Date(hour.time);
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  // Convert wind speed
  const windKnots = Math.round(kmhToKnots(windSpeed));
  const windMph = Math.round(windSpeed * 0.621371);

  // Cardinal direction
  const getCardinal = (deg: number): string => {
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
    const index = Math.round(deg / 22.5) % 16;
    return directions[index];
  };

  // Temperature in Fahrenheit
  const tempF = Math.round((temperature * 9) / 5 + 32);

  // Altitude in feet
  const altitudeFeet = Math.round(geopotentialHeight * 3.28084);

  // Assess conditions with plain language
  const getWindAssessment = (knots: number): { text: string; color: string } => {
    if (knots <= 5) return { text: 'Calm', color: 'text-gray-500' };
    if (knots <= 10) return { text: 'Light', color: 'text-green-600 dark:text-green-400' };
    if (knots <= 20) return { text: 'Moderate', color: 'text-yellow-600 dark:text-yellow-400' };
    if (knots <= 30) return { text: 'Strong', color: 'text-orange-600 dark:text-orange-400' };
    return { text: 'Dangerous', color: 'text-red-600 dark:text-red-400' };
  };

  const getHumidityAssessment = (rh: number): { text: string; color: string } => {
    if (rh >= 90) return { text: 'Cloudy', color: 'text-blue-600 dark:text-blue-400' };
    if (rh >= 70) return { text: 'Moist', color: 'text-cyan-600 dark:text-cyan-400' };
    if (rh >= 40) return { text: 'Moderate', color: 'text-gray-600 dark:text-gray-400' };
    return { text: 'Dry', color: 'text-orange-600 dark:text-orange-400' };
  };

  const windAssessment = getWindAssessment(windKnots);
  const humidityAssessment = getHumidityAssessment(relativeHumidity);

  // Compute lapse rate if we have adjacent levels
  const currentIdx = hour.pressureLevels.findIndex((pl) => pl.pressure === pressure);
  let lapseRate: number | null = null;
  let lapseRateAssessment: { text: string; color: string } | null = null;

  if (currentIdx > 0) {
    const lowerLevel = hour.pressureLevels[currentIdx - 1]; // Higher pressure = lower altitude
    const upperLevel = closestLevel;
    const dT = lowerLevel.temperature - upperLevel.temperature; // temp decrease with altitude
    const dH = (upperLevel.geopotentialHeight - lowerLevel.geopotentialHeight) * 3.28084; // altitude difference in feet
    lapseRate = (dT / dH) * 1000; // °C per 1000 ft

    // Assess stability
    if (lapseRate >= 3.0) {
      lapseRateAssessment = {
        text: 'Unstable (Good thermals)',
        color: 'text-orange-600 dark:text-orange-400',
      };
    } else if (lapseRate >= 2.0) {
      lapseRateAssessment = { text: 'Neutral', color: 'text-gray-600 dark:text-gray-400' };
    } else if (lapseRate >= 0) {
      lapseRateAssessment = {
        text: 'Stable (Poor lift)',
        color: 'text-blue-600 dark:text-blue-400',
      };
    } else {
      lapseRateAssessment = {
        text: 'Inversion (No thermals)',
        color: 'text-purple-600 dark:text-purple-400',
      };
    }
  }

  return (
    <div
      className={`bg-white dark:bg-gray-800 border border-border rounded-lg shadow-lg p-4 ${className}`}
      role="region"
      aria-label="Atmospheric conditions detail"
    >
      {/* Header with time and close button */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{timeStr}</h3>
          <p className="text-sm text-muted-foreground">{dateStr}</p>
        </div>
        {isPinned && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close detail panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Altitude */}
      <div className="mb-4 pb-3 border-b border-border">
        <p className="text-sm text-muted-foreground mb-1">Altitude</p>
        <p className="text-2xl font-bold text-foreground">
          {Math.round(geopotentialHeight)}m{' '}
          <span className="text-base font-normal">/ {altitudeFeet}ft</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">{pressure} hPa</p>
      </div>

      {/* Grid of atmospheric parameters */}
      <div className="space-y-3">
        {/* Temperature */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Temperature</span>
          <span className="text-sm font-medium text-foreground">
            {Math.round(temperature)}°C / {tempF}°F
          </span>
        </div>

        {/* Wind */}
        <div className="flex justify-between items-start">
          <span className="text-sm text-muted-foreground">Wind</span>
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">
              {windKnots} kt / {windMph} mph
            </p>
            <p className="text-xs text-muted-foreground">
              {Math.round(windDirection)}° ({getCardinal(windDirection)})
            </p>
            <p className={`text-xs font-medium ${windAssessment.color}`}>{windAssessment.text}</p>
          </div>
        </div>

        {/* Humidity */}
        <div className="flex justify-between items-start">
          <span className="text-sm text-muted-foreground">Humidity</span>
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">{Math.round(relativeHumidity)}%</p>
            <p className={`text-xs font-medium ${humidityAssessment.color}`}>
              {humidityAssessment.text}
            </p>
          </div>
        </div>

        {/* Lapse rate (if available) */}
        {lapseRate !== null && lapseRateAssessment && (
          <div className="flex justify-between items-start">
            <span className="text-sm text-muted-foreground">Lapse Rate</span>
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">{lapseRate.toFixed(1)}°C/1000ft</p>
              <p className={`text-xs font-medium ${lapseRateAssessment.color}`}>
                {lapseRateAssessment.text}
              </p>
            </div>
          </div>
        )}

        {/* Thermal Index */}
        {hour.derived.thermalIndex !== null && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Thermal Index</span>
            <span className="text-sm font-medium text-foreground">
              {Math.round(hour.derived.thermalIndex)}/100
            </span>
          </div>
        )}
      </div>

      {/* Footer hint for pinned mode */}
      {isPinned && (
        <p className="text-xs text-muted-foreground mt-4 text-center">
          Click again or press Escape to unpin
        </p>
      )}
    </div>
  );
}
