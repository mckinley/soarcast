// How sure a day is. ECMWF runs its forecast 51 times at once, each from
// slightly different starting weather: an ensemble. Where the runs agree, the
// weather is easier to forecast. Each run is rated at the launch through the
// forecast engine like the main forecast. The runs have wind, gusts, rain and
// storm energy but no thermal height, so they say whether the launch is
// flyable, not how good the soaring is. The experiment "How sure"
// (src/components/how-sure.tsx) shows them beside the main forecast.

import { evaluateDays, type GateName, type LaunchProfile } from './forecast-engine';
import { profileFromOpenMeteo, type OpenMeteoProfileResponse } from './weather-profile';
import { localSunTimes } from './sun-times';

/** ECMWF's ensemble on a 0.25° grid: 51 runs, about 25 km squares. */
export const ENSEMBLE_MODEL = 'ecmwf_ifs025';
export const ENSEMBLE_RUNS = 51;
/** Days ahead fetched, from the place's today. */
export const ENSEMBLE_DAYS = 10;
/** The grid's squares, km across. */
export const ENSEMBLE_GRID_KM = 25;

const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble';

/**
 * What each run gives. Open-Meteo counts an ensemble call as one call per
 * ten variables per run, so this is kept to what the launch gates read:
 * about 56 calls a place.
 */
const HOURLY = [
  'temperature_2m',
  'precipitation',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'wind_speed_100m',
  'wind_direction_100m',
  'cape',
  'wind_speed_850hPa',
  'wind_direction_850hPa',
  'geopotential_height_850hPa',
] as const;

export function ensembleUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    models: ENSEMBLE_MODEL,
    hourly: HOURLY.join(','),
    forecast_days: ENSEMBLE_DAYS.toString(),
    timezone: 'auto',
    // The grid square's own ground, as the main forecast uses
    elevation: 'nan',
  });
  return `${ENSEMBLE_URL}?${params}`;
}

/** Open-Meteo's ensemble answer: each variable once per run, the control run without a suffix. */
export interface EnsembleResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  hourly: { time: string[] } & Record<string, (number | null)[] | string[]>;
}

/** The runs' suffixes: "" for the control run, then "_member01" and on. */
export function ensembleRuns(data: EnsembleResponse): string[] {
  const runs = Object.keys(data.hourly)
    .map((k) => k.match(/^wind_speed_10m(_member\d+)?$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1] ?? '');
  return runs.sort();
}

/**
 * One run as the profile the engine rates. Its 100 m wind stands in for the
 * 1000 hPa level and 850 hPa is the level above, so launch-height wind comes
 * from those, as the season build does with ERA5. Hours with a missing value
 * are left out.
 */
export function runProfile(
  data: EnsembleResponse,
  run: string,
  sun: { days: string[]; sunrise: string[]; sunset: string[] },
): OpenMeteoProfileResponse {
  const series = (name: (typeof HOURLY)[number]) =>
    (data.hourly[`${name}${run}`] as (number | null)[] | undefined) ??
    data.hourly.time.map(() => null);
  const values = Object.fromEntries(HOURLY.map((v) => [v, series(v)])) as Record<
    (typeof HOURLY)[number],
    (number | null)[]
  >;
  const keep = data.hourly.time
    .map((_, i) => i)
    .filter((i) => HOURLY.every((v) => values[v][i] != null));
  const pick = (v: (typeof HOURLY)[number]) => keep.map((i) => values[v][i] as number);
  const temp = pick('temperature_2m');
  const level850 = pick('geopotential_height_850hPa');
  const zero = keep.map(() => 0);
  const none = keep.map(() => null);
  const hourly = {
    time: keep.map((i) => data.hourly.time[i]),
    temperature_2m: temp,
    wind_speed_10m: pick('wind_speed_10m'),
    wind_direction_10m: pick('wind_direction_10m'),
    wind_gusts_10m: pick('wind_gusts_10m'),
    precipitation: pick('precipitation'),
    cape: pick('cape'),
    cloud_cover: zero,
    boundary_layer_height: none,
    convective_inhibition: zero,
    lifted_index: none,
    shortwave_radiation: zero,
    // Temperatures aloft only shape the profile's freezing level, which the
    // launch gates don't read: the standard fall with height stands in.
    temperature_1000hPa: temp.map((t) => t - 0.6),
    wind_speed_1000hPa: pick('wind_speed_100m'),
    wind_direction_1000hPa: pick('wind_direction_100m'),
    geopotential_height_1000hPa: keep.map(() => data.elevation + 100),
    temperature_850hPa: temp.map((t, j) => t - 0.0065 * (level850[j] - data.elevation)),
    wind_speed_850hPa: pick('wind_speed_850hPa'),
    wind_direction_850hPa: pick('wind_direction_850hPa'),
    geopotential_height_850hPa: level850,
  };
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    elevation: data.elevation,
    timezone: data.timezone,
    daily: { time: sun.days, sunrise: sun.sunrise, sunset: sun.sunset },
    hourly: hourly as unknown as OpenMeteoProfileResponse['hourly'],
  };
}

/** How a day's runs rated at a launch. */
export interface EnsembleDay {
  date: string;
  /** Runs that covered the whole day */
  runs: number;
  /** Runs with a flyable window (what the main forecast calls Go or Flyable) */
  go: number;
  marginal: number;
  no: number;
  /** For runs without a flyable window: what held each back most */
  held: Partial<Record<GateName, number>>;
}

/** A run must have this many hours of a day to rate it. */
const MIN_DAY_HOURS = 20;

/** Every run rated at a launch, day by day. */
export function rateEnsemble(data: EnsembleResponse, launch: LaunchProfile): EnsembleDay[] {
  const days = [...new Set(data.hourly.time.map((t) => t.slice(0, 10)))];
  const sun = { days, ...localSunTimes(days, data.latitude, data.longitude, data.timezone) };
  const byDay = new Map<string, EnsembleDay>(
    days.map((date) => [date, { date, runs: 0, go: 0, marginal: 0, no: 0, held: {} }]),
  );
  for (const run of ensembleRuns(data)) {
    const profile = profileFromOpenMeteo(runProfile(data, run, sun));
    const hours = new Map<string, number>();
    for (const h of profile.hours) {
      const d = h.time.slice(0, 10);
      hours.set(d, (hours.get(d) ?? 0) + 1);
    }
    for (const score of evaluateDays(profile, launch)) {
      if ((hours.get(score.date) ?? 0) < MIN_DAY_HOURS) continue;
      const day = byDay.get(score.date)!;
      day.runs++;
      day[score.verdict]++;
      const gate = score.limitingGate as GateName | null;
      if (score.verdict !== 'go' && gate) day.held[gate] = (day.held[gate] ?? 0) + 1;
    }
  }
  return [...byDay.values()].filter((d) => d.runs > 0);
}

/** What holds a run back, in a few words. */
export const HELD_WORDS: Record<GateName, string> = {
  wind: 'too much wind',
  gusts: 'gusts',
  direction: 'wind off the launch',
  rain: 'rain',
  storm: 'storms',
  cloud: 'cloud on launch',
  visibility: 'fog',
  daylight: 'daylight',
};

/** What held back most of the runs without a flyable window, or null. */
export function mainHeld(day: EnsembleDay): GateName | null {
  const top = Object.entries(day.held).sort((a, b) => b[1] - a[1])[0];
  return top ? (top[0] as GateName) : null;
}

/** The experiment as a site page reads it. */
export type HowSureExperiment =
  | { days: EnsembleDay[]; fetchedAt: string; why: null }
  | { days: null; fetchedAt: null; why: 'not-kept' | 'failed' };
