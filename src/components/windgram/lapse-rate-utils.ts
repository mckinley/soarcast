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
 * Based on thermal soaring significance:
 * - >= 3°C/1000ft: Unstable (excellent thermals) - warm orange/yellow
 * - ~2°C/1000ft: Neutral (dry adiabatic) - light gray/white
 * - <= 1°C/1000ft: Stable (weak/no thermals) - cool blue
 * - < 0°C/1000ft: Inversion (no thermals) - deep purple/blue
 */
export function lapseRateToColor(lapseRate: number | null, isDarkTheme: boolean = false): string {
  if (lapseRate === null) {
    return isDarkTheme ? 'rgba(64, 64, 64, 0.3)' : 'rgba(200, 200, 200, 0.3)';
  }

  // Clamp lapse rate for color mapping
  const clamped = Math.max(-2, Math.min(5, lapseRate));

  // Color stops based on lapse rate (°C/1000ft)
  // Inversion: < 0 (deep blue/purple)
  // Stable: 0-1 (light blue)
  // Neutral: 1-2.5 (white/light gray)
  // Unstable: 2.5-3.5 (light orange)
  // Very unstable: > 3.5 (orange/yellow)

  let r: number, g: number, b: number;

  if (clamped < 0) {
    // Inversion: deep purple to blue
    const t = Math.max(0, (clamped + 2) / 2); // -2 to 0 → 0 to 1
    r = Math.round(80 + t * 40); // 80 to 120
    g = Math.round(50 + t * 70); // 50 to 120
    b = Math.round(150 + t * 50); // 150 to 200
  } else if (clamped < 1) {
    // Stable: blue to light blue
    const t = clamped; // 0 to 1
    if (isDarkTheme) {
      r = Math.round(80 + t * 60); // 80 to 140
      g = Math.round(120 + t * 60); // 120 to 180
      b = Math.round(200 + t * 30); // 200 to 230
    } else {
      r = Math.round(150 + t * 80); // 150 to 230
      g = Math.round(180 + t * 60); // 180 to 240
      b = Math.round(220 + t * 30); // 220 to 250
    }
  } else if (clamped < 2.5) {
    // Neutral: light blue/gray to white
    const t = (clamped - 1) / 1.5; // 1 to 2.5 → 0 to 1
    if (isDarkTheme) {
      r = Math.round(140 + t * 40); // 140 to 180
      g = Math.round(180 + t * 40); // 180 to 220
      b = Math.round(230 + t * 20); // 230 to 250
    } else {
      r = Math.round(230 + t * 25); // 230 to 255
      g = Math.round(240 + t * 15); // 240 to 255
      b = Math.round(250 + t * 5); // 250 to 255
    }
  } else if (clamped < 3.5) {
    // Unstable: white/cream to light orange
    const t = (clamped - 2.5) / 1.0; // 2.5 to 3.5 → 0 to 1
    r = Math.round(255);
    g = Math.round(250 - t * 40); // 250 to 210
    b = Math.round(240 - t * 100); // 240 to 140
  } else {
    // Very unstable: orange to yellow
    const t = Math.min(1, (clamped - 3.5) / 1.5); // 3.5 to 5 → 0 to 1
    r = Math.round(255);
    g = Math.round(210 - t * 20); // 210 to 190
    b = Math.round(140 - t * 60); // 140 to 80
  }

  return `rgba(${r}, ${g}, ${b}, 0.85)`;
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
    { label: 'Stable', color: lapseRateToColor(0.5, isDarkTheme), lapseRate: 0.5 },
    { label: 'Neutral', color: lapseRateToColor(2, isDarkTheme), lapseRate: 2 },
    { label: 'Unstable', color: lapseRateToColor(3, isDarkTheme), lapseRate: 3 },
    { label: 'Very Unstable', color: lapseRateToColor(4, isDarkTheme), lapseRate: 4 },
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
