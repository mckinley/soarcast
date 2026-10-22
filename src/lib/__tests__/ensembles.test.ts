import { describe, expect, it } from 'vitest';
import {
  ensembleRuns,
  ensembleUrl,
  mainHeld,
  rateEnsemble,
  runProfile,
  ENSEMBLE_MODEL,
  type EnsembleResponse,
} from '../ensembles';
import type { LaunchProfile } from '../forecast-engine';

const HOURS = 48;
const time = Array.from({ length: HOURS }, (_, i) => {
  const day = i < 24 ? '2026-06-15' : '2026-06-16';
  return `${day}T${String(i % 24).padStart(2, '0')}:00`;
});
const flat = (v: number | null) => Array.from({ length: HOURS }, () => v);

/** One run's series: steady wind from the west, optional rain. */
function run(suffix: string, wind: number, rain: number, gaps = false) {
  const values: Record<string, (number | null)[]> = {
    temperature_2m: flat(18),
    precipitation: flat(rain),
    wind_speed_10m: flat(wind),
    wind_direction_10m: flat(270),
    wind_gusts_10m: flat(wind),
    wind_speed_100m: flat(wind),
    wind_direction_100m: flat(270),
    cape: flat(0),
    wind_speed_850hPa: flat(wind),
    wind_direction_850hPa: flat(270),
    geopotential_height_850hPa: flat(1500),
  };
  // A run missing most of the second day
  if (gaps) values.wind_speed_10m = values.wind_speed_10m.map((v, i) => (i >= 30 ? null : v));
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [`${k}${suffix}`, v]));
}

const data: EnsembleResponse = {
  latitude: 45,
  longitude: 0,
  elevation: 300,
  timezone: 'UTC',
  hourly: {
    time,
    ...run('', 10, 0),
    ...run('_member01', 50, 0),
    ...run('_member02', 10, 2, true),
  },
};

const launch: LaunchProfile = {
  elevation: 300,
  goodDirections: [270],
  okDirections: [],
  maxWindSpeed: 25,
  kind: 'thermal',
  goal: 'launch',
};

describe('ensembleUrl', () => {
  it('asks for the ensemble at the grid square’s own ground', () => {
    const url = new URL(ensembleUrl(45.81, 6.25));
    expect(url.searchParams.get('models')).toBe(ENSEMBLE_MODEL);
    expect(url.searchParams.get('elevation')).toBe('nan');
    expect(url.searchParams.get('hourly')).toContain('wind_gusts_10m');
  });
});

describe('ensembleRuns', () => {
  it('finds the control run and each member', () => {
    expect(ensembleRuns(data)).toEqual(['', '_member01', '_member02']);
  });
});

describe('runProfile', () => {
  it('leaves out hours with a missing value', () => {
    const sun = { days: [], sunrise: [], sunset: [] };
    expect(runProfile(data, '', sun).hourly.time).toHaveLength(HOURS);
    expect(runProfile(data, '_member02', sun).hourly.time).toHaveLength(30);
  });
});

describe('rateEnsemble', () => {
  const days = rateEnsemble(data, launch);

  it('counts the runs with a flyable window each day', () => {
    expect(days[0]).toMatchObject({ date: '2026-06-15', runs: 3, go: 1, no: 2 });
    expect(days[0].held).toEqual({ wind: 1, rain: 1 });
  });

  it('skips a run that misses most of a day', () => {
    expect(days[1]).toMatchObject({ date: '2026-06-16', runs: 2, go: 1, no: 1 });
    expect(mainHeld(days[1])).toBe('wind');
  });
});
