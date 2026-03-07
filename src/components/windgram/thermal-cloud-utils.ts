// Utilities for rendering thermal and cloud indicators on windgrams

import type { AtmosphericHour } from '@/lib/weather-profile';

/**
 * Thermal strength categories based on thermal velocity (W*)
 */
export type ThermalStrength = 'none' | 'weak' | 'moderate' | 'strong' | 'very_strong';

/**
 * Calculates thermal updraft velocity (W*) from CAPE
 * Uses simplified approximation: W* ≈ 0.12 * sqrt(CAPE)
 * @param cape - Convective Available Potential Energy (J/kg)
 * @returns Thermal velocity in m/s, or null if CAPE is invalid
 */
export function calculateThermalVelocity(cape: number | null): number | null {
  if (cape === null || cape <= 0) return null;

  // Simplified formula: W* ≈ 0.12 * sqrt(CAPE)
  // This gives reasonable estimates for thermal updraft velocity
  const wStar = 0.12 * Math.sqrt(cape);

  // Note: For more accuracy, could use: W* = (g * BLH * heat_flux / (density * Cp * T))^(1/3)
  // but that requires heat flux data we don't have from Open-Meteo
  // The simplified formula is widely used and gives good results for soaring forecasts

  return wStar;
}

/**
 * Gets thermal strength category from thermal velocity (W*) in m/s
 * @param wStar - Thermal updraft velocity in m/s (null = no thermals)
 * @returns Thermal strength category and display color
 */
export function getThermalStrengthFromVelocity(wStar: number | null): {
  strength: ThermalStrength;
  color: string;
  label: string;
} {
  if (wStar === null || wStar < 0.5) {
    return {
      strength: 'none',
      color: '#9ca3af', // gray-400
      label: 'None',
    };
  }
  if (wStar < 1) {
    return {
      strength: 'weak',
      color: '#60a5fa', // blue-400
      label: 'Weak',
    };
  }
  if (wStar < 2) {
    return {
      strength: 'moderate',
      color: '#34d399', // green-400
      label: 'Moderate',
    };
  }
  if (wStar < 3) {
    return {
      strength: 'strong',
      color: '#fb923c', // orange-400
      label: 'Strong',
    };
  }
  return {
    strength: 'very_strong',
    color: '#ef4444', // red-500
    label: 'Very Strong',
  };
}

/**
 * Formats thermal velocity for display (e.g., "2.3" or "—")
 */
export function formatThermalVelocity(wStar: number | null): string {
  if (wStar === null) return '—';
  return wStar.toFixed(1);
}

/**
 * Draws thermal velocity (W*) indicator at top of chart
 * Shows thermal updraft strength in m/s as colored badge
 */
export function drawThermalIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cape: number | null,
  isDark: boolean,
): void {
  const wStar = calculateThermalVelocity(cape);
  const { color } = getThermalStrengthFromVelocity(wStar);
  const displayValue = formatThermalVelocity(wStar);

  // Draw background badge
  const badgeWidth = 38;
  const badgeHeight = 20;
  ctx.fillStyle = color;
  ctx.fillRect(x - badgeWidth / 2, y - badgeHeight / 2, badgeWidth, badgeHeight);

  // Draw W* value
  ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = isDark ? '#000000' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(displayValue.toString(), x, y);
}

/**
 * Converts altitude in meters to chart Y coordinate
 */
export function altitudeToY(
  altitude: number,
  chartTop: number,
  chartHeight: number,
  minAltitude: number,
  maxAltitude: number,
): number {
  const fraction = (altitude - minAltitude) / (maxAltitude - minAltitude);
  // Invert Y axis (0 at bottom, max at top)
  return chartTop + chartHeight * (1 - fraction);
}

/**
 * Draws a dashed horizontal line for cloud base, top of lift, or boundary layer
 */
export function drawHorizontalLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  startX: number,
  endX: number,
  color: string,
  lineWidth: number = 2,
  dashPattern: number[] = [5, 5],
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dashPattern);
  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.lineTo(endX, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws a text label for a horizontal line
 */
export function drawLineLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  backgroundColor: string = 'rgba(255, 255, 255, 0.9)',
): void {
  ctx.save();
  ctx.font = '10px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Measure text for background
  const metrics = ctx.measureText(text);
  const padding = 3;
  const bgWidth = metrics.width + padding * 2;
  const bgHeight = 16;

  // Draw background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(x, y - bgHeight / 2, bgWidth, bgHeight);

  // Draw text
  ctx.fillStyle = color;
  ctx.fillText(text, x + padding, y);
  ctx.restore();
}

/**
 * Draws cloud/moisture shading for areas with high humidity
 * Uses a subtle pattern to indicate potential cloud layers
 */
export function drawMoistureShading(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  humidity: number,
  isDark: boolean,
): void {
  // Only shade if humidity > 90%
  if (humidity < 90) return;

  // Calculate opacity based on humidity (90% = subtle, 100% = more visible)
  const opacity = Math.min(0.3, ((humidity - 90) / 10) * 0.3);

  // Use diagonal line pattern for cloud hatching
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = isDark ? '#93c5fd' : '#3b82f6'; // blue-300 : blue-500
  ctx.lineWidth = 1;

  // Draw diagonal lines
  const spacing = 8;
  const width = x2 - x1;
  const height = y2 - y1;

  for (let offset = -height; offset < width + height; offset += spacing) {
    ctx.beginPath();
    const x0 = x1 + offset;
    const y0 = y1;
    const x3 = x0 + height;
    const y3 = y1 + height;

    ctx.moveTo(Math.max(x1, x0), Math.max(y1, y0));
    ctx.lineTo(Math.min(x2, x3), Math.min(y2, y3));
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Collects line data for cloud base, top of lift, and boundary layer
 * Returns arrays of Y coordinates for each hour (for smooth line drawing)
 */
export function collectLineData(
  hours: AtmosphericHour[],
  chartTop: number,
  chartHeight: number,
  minAltitude: number,
  maxAltitude: number,
  elevation: number,
): {
  cloudBase: (number | null)[];
  topOfLift: (number | null)[];
  boundaryLayer: (number | null)[];
} {
  const cloudBase: (number | null)[] = [];
  const topOfLift: (number | null)[] = [];
  const boundaryLayer: (number | null)[] = [];

  for (const hour of hours) {
    // Cloud base (convert AGL to MSL)
    const cbAgl = hour.derived.estimatedCloudBase;
    if (cbAgl !== null) {
      const cbMsl = elevation + cbAgl;
      // Only draw if above the visible chart area (above minAltitude)
      if (cbMsl >= minAltitude) {
        cloudBase.push(altitudeToY(cbMsl, chartTop, chartHeight, minAltitude, maxAltitude));
      } else {
        cloudBase.push(null);
      }
    } else {
      cloudBase.push(null);
    }

    // Top of lift (already in MSL)
    const tol = hour.derived.estimatedTopOfLift;
    if (tol !== null) {
      // Only draw if above the visible chart area (above minAltitude)
      if (tol >= minAltitude) {
        topOfLift.push(altitudeToY(tol, chartTop, chartHeight, minAltitude, maxAltitude));
      } else {
        topOfLift.push(null);
      }
    } else {
      topOfLift.push(null);
    }

    // Boundary layer height (convert AGL to MSL)
    const blh = hour.surface.boundaryLayerHeight;
    if (blh !== null) {
      const blhMsl = elevation + blh;
      // Only draw if above the visible chart area (above minAltitude)
      if (blhMsl >= minAltitude) {
        boundaryLayer.push(altitudeToY(blhMsl, chartTop, chartHeight, minAltitude, maxAltitude));
      } else {
        boundaryLayer.push(null);
      }
    } else {
      boundaryLayer.push(null);
    }
  }

  return { cloudBase, topOfLift, boundaryLayer };
}

/**
 * Draws a smooth line connecting points (with null handling)
 */
export function drawSmoothLine(
  ctx: CanvasRenderingContext2D,
  xCoords: number[],
  yCoords: (number | null)[],
  color: string,
  lineWidth: number = 2,
  dashPattern: number[] = [5, 5],
): void {
  if (xCoords.length !== yCoords.length) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dashPattern);

  let pathStarted = false;

  for (let i = 0; i < xCoords.length; i++) {
    const x = xCoords[i];
    const y = yCoords[i];

    if (y === null) {
      pathStarted = false;
      continue;
    }

    if (!pathStarted) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      pathStarted = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  if (pathStarted) {
    ctx.stroke();
  }

  ctx.restore();
}
