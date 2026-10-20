/**
 * Shapes one day of an atmospheric profile for the windgram: the columns of
 * levels it draws, the lapse rate, temperature and cloud at any height, and
 * the altitude range. Pure functions, so the chart's numbers can be tested.
 */

import type { AtmosphericHour, AtmosphericProfile } from '@/lib/weather-profile';
import { THERMAL_MIN_WSTAR } from '@/lib/forecast-engine/gates';
import { calculateLapseRateBetweenLevels } from './lapse-rate-utils';

/**
 * Pressure levels within this of the model's ground are dropped: Open-Meteo
 * still reports levels below the ground, extrapolated, and a level right at
 * it adds nothing to the 2 m and 10 m surface values.
 */
const MIN_LEVEL_ABOVE_GROUND_M = 20;

export interface WindgramLevel {
  alt: number; // m MSL
  temperature: number; // °C
  windSpeed: number; // km/h
  windDirection: number; // degrees, where the wind comes from
  cloudCover: number; // %
  /** The model's 2 m temperature and 10 m wind, at its ground */
  surface: boolean;
}

export interface WindgramLayer {
  bottom: number; // m MSL
  top: number; // m MSL
  /** Cooling, °C per 1000 ft */
  rate: number;
}

export interface WindgramColumn {
  time: string; // local ISO
  hour: number; // local hour
  /** Surface first, then the pressure levels above the ground, bottom up */
  levels: WindgramLevel[];
  layers: WindgramLayer[];
  wStar: number | null; // m/s
  /** Top of usable lift (m MSL), the forecast engine's, when thermals are climbable */
  topOfLift: number | null;
  /** Cumulus base (m MSL) when thermals reach it */
  cumulusBase: number | null;
}

/** One hour's levels from the model ground up, with the lapse rate of each layer between them. */
export function windgramColumn(hour: AtmosphericHour, ground: number): WindgramColumn {
  const aloft = hour.pressureLevels
    .filter((l) => l.geopotentialHeight > ground + MIN_LEVEL_ABOVE_GROUND_M)
    .sort((a, b) => a.geopotentialHeight - b.geopotentialHeight)
    .map(
      (l): WindgramLevel => ({
        alt: l.geopotentialHeight,
        temperature: l.temperature,
        windSpeed: l.windSpeed,
        windDirection: l.windDirection,
        cloudCover: l.cloudCover ?? 0,
        surface: false,
      }),
    );
  const surface: WindgramLevel = {
    alt: ground,
    temperature: hour.surface.temperature,
    windSpeed: hour.surface.windSpeed,
    windDirection: hour.surface.windDirection,
    // Cloud at the lowest level reaches the ground: fog or hill cloud
    cloudCover: aloft[0]?.cloudCover ?? 0,
    surface: true,
  };
  const levels = [surface, ...aloft];

  const layers: WindgramLayer[] = [];
  for (let i = 0; i < levels.length - 1; i++) {
    const rate = calculateLapseRateBetweenLevels(
      levels[i].temperature,
      levels[i + 1].temperature,
      levels[i].alt,
      levels[i + 1].alt,
    );
    if (rate !== null) layers.push({ bottom: levels[i].alt, top: levels[i + 1].alt, rate });
  }

  const { wStar, estimatedTopOfLift, estimatedCloudBase } = hour.derived;
  const thermals = wStar !== null && wStar >= THERMAL_MIN_WSTAR;
  const topOfLift = thermals ? estimatedTopOfLift : null;
  const cloudBase = estimatedCloudBase !== null ? ground + estimatedCloudBase : null;
  // The engine's top of lift is the lower of the boundary layer top and
  // cloud base, so thermals reach cloud base when the two meet
  const cumulusBase =
    topOfLift !== null && cloudBase !== null && cloudBase <= topOfLift + 1 ? cloudBase : null;

  return {
    time: hour.time,
    hour: parseInt(hour.time.slice(11, 13), 10),
    levels,
    layers,
    wStar,
    topOfLift,
    cumulusBase,
  };
}

/**
 * Cooling rate (°C/1000ft) at a height: each layer's rate sits at its middle
 * and is interpolated between them, as RASP contours it, so bands change
 * smoothly from one layer to the next.
 */
export function lapseRateAt(layers: WindgramLayer[], alt: number): number | null {
  if (layers.length === 0) return null;
  const mid = (l: WindgramLayer) => (l.bottom + l.top) / 2;
  if (alt <= mid(layers[0])) return layers[0].rate;
  for (let i = 0; i < layers.length - 1; i++) {
    const lo = mid(layers[i]);
    const hi = mid(layers[i + 1]);
    if (alt <= hi) {
      const f = (alt - lo) / (hi - lo);
      return layers[i].rate + f * (layers[i + 1].rate - layers[i].rate);
    }
  }
  return layers[layers.length - 1].rate;
}

/** Linear interpolation of a level value at a height; the ends are held beyond the levels. */
export function levelValueAt(
  levels: WindgramLevel[],
  alt: number,
  value: (l: WindgramLevel) => number,
): number | null {
  if (levels.length === 0) return null;
  if (alt <= levels[0].alt) return value(levels[0]);
  for (let i = 0; i < levels.length - 1; i++) {
    if (alt <= levels[i + 1].alt) {
      const f = (alt - levels[i].alt) / (levels[i + 1].alt - levels[i].alt);
      return value(levels[i]) + f * (value(levels[i + 1]) - value(levels[i]));
    }
  }
  return value(levels[levels.length - 1]);
}

/** The level nearest a height, for exact wind readouts */
export function nearestLevel(levels: WindgramLevel[], alt: number): WindgramLevel | null {
  let best: WindgramLevel | null = null;
  for (const l of levels) {
    if (!best || Math.abs(l.alt - alt) < Math.abs(best.alt - alt)) best = l;
  }
  return best;
}

/**
 * The hours a day's windgram shows: sunrise to sunset, rounded out to whole
 * hours and kept within 6:00-21:00, or 7:00-20:00 when the day's sun times
 * are unknown.
 */
export function daylightHours(
  hours: AtmosphericHour[],
  sunrise?: string,
  sunset?: string,
): AtmosphericHour[] {
  const hourOf = (iso: string) => parseInt(iso.slice(11, 13), 10);
  const minuteOf = (iso: string) => parseInt(iso.slice(14, 16), 10) || 0;
  const first = sunrise ? Math.max(6, hourOf(sunrise)) : 7;
  const last = sunset ? Math.min(21, hourOf(sunset) + (minuteOf(sunset) > 0 ? 1 : 0)) : 20;
  return hours.filter((h) => {
    const hour = hourOf(h.time);
    return hour >= first && hour <= last;
  });
}

export interface AltitudeRange {
  min: number; // m MSL
  max: number; // m MSL
}

/**
 * Bottom and top of the chart. It starts at the model's ground (or the launch,
 * if that is lower) and reaches 1,200 m above the week's highest top of lift,
 * and at least 1,500 m above the launch and 2,000 m above the ground, so one
 * site keeps one scale from day to day.
 */
export function altitudeRange(profile: AtmosphericProfile, launchElevation?: number): AltitudeRange {
  const ground = profile.elevation;
  const launch = launchElevation ?? ground;
  const min = Math.floor(Math.min(ground, launch) / 50) * 50;

  let highestTop = ground;
  for (const hour of profile.hours) {
    const h = parseInt(hour.time.slice(11, 13), 10);
    const top = hour.derived.estimatedTopOfLift;
    if (h >= 9 && h <= 19 && top !== null && top > highestTop) highestTop = top;
  }
  const highestLevel = Math.max(
    ground + 2000,
    ...profile.hours.slice(0, 1).flatMap((h) => h.pressureLevels.map((l) => l.geopotentialHeight)),
  );
  const wanted = Math.max(highestTop + 1200, launch + 1500, ground + 2000);
  const max = Math.min(Math.ceil(wanted / 500) * 500, Math.floor(highestLevel / 100) * 100, 6000);
  return { min, max: Math.max(max, min + 1000) };
}

export interface GridSpec {
  /** Columns per hour */
  sub: number;
  /**
   * Extra grid points beyond each edge, so the edges d3.contours closes its
   * rings along fall outside the chart (half an hour left and right of the
   * first and last hour's column middles)
   */
  padX: number;
  padY: number;
  nx: number;
  ny: number;
  /** Meters per grid row */
  dy: number;
  /** Altitude of grid row `padY` (the chart's top) */
  top: number;
}

/**
 * A regular time x altitude grid over the chart for d3.contours, rows from
 * the top down. Values between hours are interpolated in time at the same
 * height. Grid point (i, j) sits at contour coordinate (i + 0.5, j + 0.5).
 */
export function sampleGrid(
  columns: WindgramColumn[],
  range: AltitudeRange,
  valueAt: (column: WindgramColumn, alt: number) => number | null,
  rows = 120,
): { spec: GridSpec; values: number[] } {
  const sub = 4;
  const padX = sub / 2 + 1;
  const padY = 1;
  const nx = (columns.length - 1) * sub + 1 + 2 * padX;
  const ny = rows + 1 + 2 * padY;
  const dy = (range.max - range.min) / rows;
  const values = new Array<number>(nx * ny);
  const last = columns.length - 1;

  for (let j = 0; j < ny; j++) {
    const alt = range.max - (j - padY) * dy;
    const atHour = columns.map((c) => valueAt(c, alt));
    for (let i = 0; i < nx; i++) {
      const t = Math.max(0, Math.min(last, (i - padX) / sub));
      const t0 = Math.floor(t);
      const t1 = Math.min(last, t0 + 1);
      const a = atHour[t0];
      const b = atHour[t1];
      const f = t - t0;
      values[j * nx + i] =
        a === null && b === null ? NaN : a === null ? b! : b === null ? a : a + f * (b - a);
    }
  }
  return { spec: { sub, padX, padY, nx, ny, dy, top: range.max }, values };
}
