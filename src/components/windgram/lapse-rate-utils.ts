/**
 * Lapse rate calculation and visualization utilities for windgrams
 */

import type { AtmosphericHour } from '@/lib/weather-profile';

/**
 * Calculates lapse rate between two pressure levels
 * @param tempLower - Temperature at lower altitude (°C)
 * @param tempUpper - Temperature at higher altitude (°C)
 * @param heightLower - Height at lower altitude (meters)
 * @param heightUpper - Height at higher altitude (meters)
 * @returns Lapse rate in °C/1000ft, or null if invalid
 */
export function calculateLapseRateBetweenLevels(
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
 * Computes lapse rates between all adjacent pressure levels for a single hour
 * Returns an array of lapse rates for each layer
 */
export function computeLapseRatesForHour(hour: AtmosphericHour): (number | null)[] {
  const { pressureLevels } = hour;
  const lapseRates: (number | null)[] = [];

  // Calculate lapse rate between each adjacent pair of pressure levels
  for (let i = 0; i < pressureLevels.length - 1; i++) {
    const lower = pressureLevels[i]; // Higher pressure = lower altitude
    const upper = pressureLevels[i + 1]; // Lower pressure = higher altitude

    const lapseRate = calculateLapseRateBetweenLevels(
      lower.temperature,
      upper.temperature,
      lower.geopotentialHeight,
      upper.geopotentialHeight,
    );

    lapseRates.push(lapseRate);
  }

  return lapseRates;
}

/**
 * Color scale for lapse rate visualization
 * Based on thermal soaring significance, matching RASP windgram style:
 * - >= 3°C/1000ft: Unstable (excellent thermals) - warm orange/red
 * - ~2°C/1000ft: Neutral (dry adiabatic) - pale yellow/white
 * - <= 1°C/1000ft: Stable (weak/no thermals) - lavender/light purple
 * - < 0°C/1000ft: Inversion (no thermals) - deep purple
 */
export function lapseRateToColor(lapseRate: number | null, isDarkTheme: boolean = false): string {
  if (lapseRate === null) {
    return isDarkTheme ? 'rgba(64, 64, 64, 0.5)' : 'rgba(200, 200, 200, 0.5)';
  }

  // Clamp lapse rate for color mapping
  const clamped = Math.max(-2, Math.min(5, lapseRate));

  // Color stops based on lapse rate (°C/1000ft)
  // Inversion: < 0 (deep purple)
  // Stable: 0-1.5 (lavender to light purple)
  // Neutral: 1.5-2.5 (pale yellow/cream to white)
  // Unstable: 2.5-3.5 (light orange to orange)
  // Very unstable: > 3.5 (orange to red)

  let r: number, g: number, b: number;

  if (clamped < 0) {
    // Inversion: deep purple to medium purple
    const t = Math.max(0, (clamped + 2) / 2); // -2 to 0 → 0 to 1
    if (isDarkTheme) {
      r = Math.round(60 + t * 40); // 60 to 100
      g = Math.round(30 + t * 50); // 30 to 80
      b = Math.round(120 + t * 60); // 120 to 180
    } else {
      r = Math.round(80 + t * 60); // 80 to 140
      g = Math.round(40 + t * 80); // 40 to 120
      b = Math.round(140 + t * 80); // 140 to 220
    }
  } else if (clamped < 1.5) {
    // Stable: lavender to light purple
    const t = clamped / 1.5; // 0 to 1.5 → 0 to 1
    if (isDarkTheme) {
      r = Math.round(100 + t * 60); // 100 to 160
      g = Math.round(80 + t * 80); // 80 to 160
      b = Math.round(180 + t * 50); // 180 to 230
    } else {
      r = Math.round(140 + t * 60); // 140 to 200
      g = Math.round(120 + t * 90); // 120 to 210
      b = Math.round(220 + t * 30); // 220 to 250
    }
  } else if (clamped < 2.5) {
    // Neutral: pale yellow/cream (approaching dry adiabatic)
    const t = (clamped - 1.5) / 1.0; // 1.5 to 2.5 → 0 to 1
    if (isDarkTheme) {
      r = Math.round(160 + t * 60); // 160 to 220
      g = Math.round(160 + t * 60); // 160 to 220
      b = Math.round(230 + t * 20); // 230 to 250
    } else {
      r = Math.round(250 + t * 5); // 250 to 255
      g = Math.round(245 + t * 10); // 245 to 255
      b = Math.round(230 - t * 20); // 230 to 210
    }
  } else if (clamped < 3.5) {
    // Unstable: pale orange to orange
    const t = (clamped - 2.5) / 1.0; // 2.5 to 3.5 → 0 to 1
    r = Math.round(255);
    g = Math.round(210 - t * 40); // 210 to 170
    b = Math.round(150 - t * 70); // 150 to 80
  } else {
    // Very unstable: orange to red/orange
    const t = Math.min(1, (clamped - 3.5) / 1.5); // 3.5 to 5 → 0 to 1
    r = Math.round(255);
    g = Math.round(170 - t * 50); // 170 to 120
    b = Math.round(80 - t * 50); // 80 to 30
  }

  // Use fully opaque colors for vivid, rich fills like RASP reference
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Get color legend entries for the lapse rate scale
 */
export interface LegendEntry {
  label: string;
  color: string;
  lapseRate: number;
}

export function getLapseRateLegend(isDarkTheme: boolean = false): LegendEntry[] {
  return [
    { label: 'Inversion', color: lapseRateToColor(-1, isDarkTheme), lapseRate: -1 },
    { label: 'Stable', color: lapseRateToColor(0.75, isDarkTheme), lapseRate: 0.75 },
    { label: 'Neutral', color: lapseRateToColor(2, isDarkTheme), lapseRate: 2 },
    { label: 'Unstable', color: lapseRateToColor(3, isDarkTheme), lapseRate: 3 },
    { label: 'Very Unstable', color: lapseRateToColor(4.5, isDarkTheme), lapseRate: 4.5 },
  ];
}

/**
 * Bilinear interpolation for smooth color gradients
 * Interpolates value at (x, y) from four corner values
 */
export function bilinearInterpolate(
  x: number, // 0 to 1
  y: number, // 0 to 1
  v00: number | null, // bottom-left
  v10: number | null, // bottom-right
  v01: number | null, // top-left
  v11: number | null, // top-right
): number | null {
  // If ALL corners are null, return null
  if (v00 === null && v10 === null && v01 === null && v11 === null) {
    return null;
  }

  // If any corner is null, fall back to nearest non-null neighbor
  if (v00 === null || v10 === null || v01 === null || v11 === null) {
    // Find closest non-null corner
    const corners = [
      { value: v00, dist: Math.sqrt(x * x + y * y) },
      { value: v10, dist: Math.sqrt((1 - x) * (1 - x) + y * y) },
      { value: v01, dist: Math.sqrt(x * x + (1 - y) * (1 - y)) },
      { value: v11, dist: Math.sqrt((1 - x) * (1 - x) + (1 - y) * (1 - y)) },
    ];

    const validCorners = corners.filter((c) => c.value !== null);
    if (validCorners.length === 0) return null;

    // Return closest non-null value
    validCorners.sort((a, b) => a.dist - b.dist);
    return validCorners[0].value;
  }

  // Standard bilinear interpolation
  const v0 = v00 * (1 - x) + v10 * x; // Interpolate bottom edge
  const v1 = v01 * (1 - x) + v11 * x; // Interpolate top edge
  return v0 * (1 - y) + v1 * y; // Interpolate between edges
}
