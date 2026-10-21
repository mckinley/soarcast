/**
 * Wind barbs in km/h, as canadarasp's windgrams draw them: a flag is
 * 50 km/h, a long feather 10 and a short one 5. SoarCast states every wind
 * limit in km/h, so the barbs count in the same unit.
 */

/** What a barb's flag, long feather and short feather each stand for, in km/h. */
export const BARB_FLAG_KMH = 50;
export const BARB_LONG_KMH = 10;
export const BARB_SHORT_KMH = 5;

export interface WindBarbConfig {
  /** Speed rounded to the nearest 5 km/h */
  speedKmh: number;
  /** Degrees the wind comes from */
  direction: number;
  flags: number;
  fullBarbs: number;
  halfBarbs: number;
  calm: boolean;
}

export function windSpeedToBarb(speedKmh: number, direction: number): WindBarbConfig {
  const rounded = Math.round(speedKmh / BARB_SHORT_KMH) * BARB_SHORT_KMH;
  let remaining = rounded;
  const flags = Math.floor(remaining / BARB_FLAG_KMH);
  remaining -= flags * BARB_FLAG_KMH;
  const fullBarbs = Math.floor(remaining / BARB_LONG_KMH);
  remaining -= fullBarbs * BARB_LONG_KMH;
  const halfBarbs = remaining >= BARB_SHORT_KMH ? 1 : 0;
  return { speedKmh: rounded, direction, flags, fullBarbs, halfBarbs, calm: rounded === 0 };
}

/**
 * SVG path of a barb with its station at (0,0) and its shaft pointing up
 * (north); rotate it by the wind direction. Feathers sit on the clockwise
 * side and slant away from the station, flags at the tip, and a lone short
 * feather is set in from the tip so it isn't read as a long one.
 * @param length - shaft length in px
 */
export function windBarbPath(config: WindBarbConfig, length: number): string {
  const feather = length * 0.38; // how far a feather reaches out from the shaft
  const slant = length * 0.2; // how far its tip leans away from the station
  const spacing = length * 0.18;
  const flagBase = length * 0.24;

  const parts = [`M0 0V${-length}`];
  let pos = length; // distance from the station, working inward from the tip

  for (let i = 0; i < config.flags; i++) {
    parts.push(`M0 ${-pos}L${feather} ${-(pos - flagBase / 2)}L0 ${-(pos - flagBase)}Z`);
    pos -= flagBase + spacing * 0.5;
  }
  for (let i = 0; i < config.fullBarbs; i++) {
    parts.push(`M0 ${-pos}L${feather} ${-(pos + slant)}`);
    pos -= spacing;
  }
  if (config.halfBarbs > 0) {
    if (config.flags === 0 && config.fullBarbs === 0) pos -= spacing;
    parts.push(`M0 ${-pos}L${feather / 2} ${-(pos + slant / 2)}`);
  }
  return parts.join('');
}

const COMPASS = [
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

/** Compass point a wind comes from, e.g. 225 -> SW */
export function compassPoint(direction: number): string {
  return COMPASS[Math.round((((direction % 360) + 360) % 360) / 22.5) % 16];
}
