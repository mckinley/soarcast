/**
 * Wind barb utilities for windgram visualization
 * Implements standard meteorological wind barb convention
 */

/**
 * Convert wind speed from km/h to knots
 */
export function kmhToKnots(kmh: number): number {
  return kmh * 0.539957;
}

/**
 * Wind barb configuration for rendering
 */
export interface WindBarbConfig {
  /** Wind speed in knots (rounded to nearest 5) */
  speedKnots: number;
  /** Wind direction in degrees (0-360, meteorological: direction FROM which wind blows) */
  direction: number;
  /** Number of 50-knot flags */
  flags: number;
  /** Number of 10-knot full barbs */
  fullBarbs: number;
  /** Number of 5-knot half barbs */
  halfBarbs: number;
  /** Speed category for color coding */
  category: 'calm' | 'light' | 'moderate' | 'strong' | 'dangerous';
  /** Display color (RGB string) */
  color: string;
}

/**
 * Convert wind speed and direction to barb rendering configuration
 *
 * Standard convention:
 * - Shaft points INTO the direction wind is blowing FROM (meteorological convention)
 * - 50 kt = one flag (triangle)
 * - 10 kt = one full barb (line)
 * - 5 kt = one half barb (short line)
 * - Wind speeds rounded to nearest 5 kt
 *
 * @param speedKmh Wind speed in km/h
 * @param direction Wind direction in degrees (0-360)
 * @param isDarkTheme Whether dark theme is active (affects color brightness)
 */
export function windSpeedToBarb(
  speedKmh: number,
  direction: number,
  isDarkTheme: boolean = false,
): WindBarbConfig {
  // Convert to knots and round to nearest 5
  const exactKnots = kmhToKnots(speedKmh);
  const speedKnots = Math.round(exactKnots / 5) * 5;

  // Calculate barb components
  let remainingSpeed = speedKnots;
  const flags = Math.floor(remainingSpeed / 50);
  remainingSpeed -= flags * 50;
  const fullBarbs = Math.floor(remainingSpeed / 10);
  remainingSpeed -= fullBarbs * 10;
  const halfBarbs = Math.floor(remainingSpeed / 5);

  // Determine category and color
  let category: WindBarbConfig['category'];
  let color: string;

  if (speedKnots === 0) {
    category = 'calm';
    color = isDarkTheme ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)'; // gray
  } else if (speedKnots <= 10) {
    category = 'light';
    color = isDarkTheme ? 'rgb(134, 239, 172)' : 'rgb(34, 197, 94)'; // green
  } else if (speedKnots <= 20) {
    category = 'moderate';
    color = isDarkTheme ? 'rgb(253, 224, 71)' : 'rgb(234, 179, 8)'; // yellow
  } else if (speedKnots <= 30) {
    category = 'strong';
    color = isDarkTheme ? 'rgb(251, 146, 60)' : 'rgb(249, 115, 22)'; // orange
  } else {
    category = 'dangerous';
    color = isDarkTheme ? 'rgb(248, 113, 113)' : 'rgb(239, 68, 68)'; // red
  }

  return {
    speedKnots,
    direction,
    flags,
    fullBarbs,
    halfBarbs,
    category,
    color,
  };
}

/**
 * Draw a wind barb on a canvas context
 *
 * @param ctx Canvas rendering context
 * @param x Center X coordinate
 * @param y Center Y coordinate
 * @param config Wind barb configuration
 * @param scale Size scale factor (1.0 = default size)
 */
export function drawWindBarb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  config: WindBarbConfig,
  scale: number = 1.0,
): void {
  const { speedKnots, direction, flags, fullBarbs, halfBarbs, color } = config;

  // Calm winds: draw circle
  if (speedKnots === 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.arc(x, y, 4 * scale, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  // Convert direction to radians
  // Meteorological convention: wind direction is where wind comes FROM
  // Rotate so barbs point into the wind
  const angleRad = ((direction + 180) * Math.PI) / 180;

  // Shaft properties
  const shaftLength = 20 * scale;
  const barbLength = 8 * scale;
  const halfBarbLength = 4 * scale;
  const barbSpacing = 3.5 * scale;
  const barbAngle = Math.PI / 4; // 45 degrees

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';

  // Calculate shaft endpoint
  const shaftEndX = x + Math.cos(angleRad) * shaftLength;
  const shaftEndY = y + Math.sin(angleRad) * shaftLength;

  // Draw shaft
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(shaftEndX, shaftEndY);
  ctx.stroke();

  // Draw barbs starting from the end of the shaft
  let currentDistance = shaftLength;

  // Draw flags (50 kt triangles)
  for (let i = 0; i < flags; i++) {
    const barbX = x + Math.cos(angleRad) * currentDistance;
    const barbY = y + Math.sin(angleRad) * currentDistance;

    // Triangle flag pointing clockwise from shaft
    const tip1X = barbX + Math.cos(angleRad + barbAngle) * barbLength;
    const tip1Y = barbY + Math.sin(angleRad + barbAngle) * barbLength;
    const tip2X = barbX + Math.cos(angleRad) * (barbSpacing * 1.5);
    const tip2Y = barbY + Math.sin(angleRad) * (barbSpacing * 1.5);

    ctx.beginPath();
    ctx.moveTo(barbX, barbY);
    ctx.lineTo(tip1X, tip1Y);
    ctx.lineTo(tip2X, tip2Y);
    ctx.closePath();
    ctx.fill();

    currentDistance -= barbSpacing * 2;
  }

  // Small gap after flags
  if (flags > 0) {
    currentDistance -= barbSpacing * 0.5;
  }

  // Draw full barbs (10 kt lines)
  for (let i = 0; i < fullBarbs; i++) {
    const barbX = x + Math.cos(angleRad) * currentDistance;
    const barbY = y + Math.sin(angleRad) * currentDistance;
    const tipX = barbX + Math.cos(angleRad + barbAngle) * barbLength;
    const tipY = barbY + Math.sin(angleRad + barbAngle) * barbLength;

    ctx.beginPath();
    ctx.moveTo(barbX, barbY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    currentDistance -= barbSpacing;
  }

  // Draw half barb (5 kt short line)
  if (halfBarbs > 0) {
    const barbX = x + Math.cos(angleRad) * currentDistance;
    const barbY = y + Math.sin(angleRad) * currentDistance;
    const tipX = barbX + Math.cos(angleRad + barbAngle) * halfBarbLength;
    const tipY = barbY + Math.sin(angleRad + barbAngle) * halfBarbLength;

    ctx.beginPath();
    ctx.moveTo(barbX, barbY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
}

/**
 * Format wind data for tooltip display
 */
export function formatWindTooltip(
  speedKmh: number,
  direction: number,
  altitude: { meters: number; feet: number },
): string {
  const speedKnots = Math.round(kmhToKnots(speedKmh));
  const speedMph = Math.round(speedKmh * 0.621371);

  // Cardinal direction
  const cardinalDirs = [
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
  const cardinalIndex = Math.round(direction / 22.5) % 16;
  const cardinal = cardinalDirs[cardinalIndex];

  return `${speedKnots} kt (${speedMph} mph) from ${direction}° (${cardinal})\n${Math.round(altitude.meters)}m / ${Math.round(altitude.feet)}ft`;
}
