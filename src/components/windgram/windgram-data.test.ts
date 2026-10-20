import { describe, it, expect } from 'vitest';
import type { AtmosphericHour, AtmosphericProfile } from '@/lib/weather-profile';
import {
  altitudeRange,
  daylightHours,
  lapseRateAt,
  levelValueAt,
  sampleGrid,
  windgramColumn,
} from './windgram-data';

const GROUND = 285;

/** Tiger Mountain at 1 PM on 2026-10-20 (HRRR via Open-Meteo), trimmed */
function tigerHour(time = '2026-10-20T13:00', o: Partial<AtmosphericHour['derived']> = {}): AtmosphericHour {
  const levels: Array<[number, number, number, number, number]> = [
    // pressure, height, temperature, wind speed, wind direction
    [1000, 149, 14, 8.7, 9],
    [975, 362, 12.3, 11.3, 12],
    [950, 580, 11.8, 11.3, 26],
    [925, 803, 12.3, 11.4, 85],
    [900, 1033, 12.1, 22.2, 122],
    [850, 1509, 9.9, 21.8, 149],
    [700, 3092, -0.3, 18.8, 182],
  ];
  return {
    time,
    pressureLevels: levels.map(([pressure, geopotentialHeight, temperature, windSpeed, windDirection]) => ({
      pressure: pressure as AtmosphericHour['pressureLevels'][number]['pressure'],
      geopotentialHeight,
      temperature,
      windSpeed,
      windDirection,
      relativeHumidity: 50,
      cloudCover: pressure === 700 ? 80 : 0,
    })),
    surface: {
      temperature: 13.1,
      windSpeed: 9.5,
      windDirection: 22,
      windGusts: 20,
      cloudCover: 10,
      cape: 0,
      precipitationProbability: 0,
      boundaryLayerHeight: 365,
      convectiveInhibition: 0,
      liftedIndex: 5,
      shortwaveRadiation: 514,
    },
    derived: {
      lapseRate: 2,
      thermalIndex: 40,
      estimatedCloudBase: 900,
      estimatedTopOfLift: 650,
      wStar: 1.2,
      freezingLevel: 3060,
      windShearMax: 10,
      odPotential: 0,
      ...o,
    },
  };
}

describe('windgramColumn', () => {
  const column = windgramColumn(tigerHour(), GROUND);

  it('starts at the model ground and drops levels below it', () => {
    expect(column.levels[0]).toMatchObject({ alt: GROUND, temperature: 13.1, windSpeed: 9.5, surface: true });
    expect(column.levels.slice(1).every((l) => l.alt > GROUND + 20)).toBe(true);
    expect(column.levels.map((l) => l.alt)).toEqual([285, 362, 580, 803, 1033, 1509, 3092]);
  });

  it('shows the warm surface layer and the inversion above it', () => {
    // 2 m temperature 13.1 °C to 12.3 °C 77 m higher: faster than dry adiabatic
    expect(column.layers[0].rate).toBeGreaterThan(3);
    // 11.8 °C at 580 m to 12.3 °C at 803 m
    expect(column.layers[2].rate).toBeLessThan(0);
  });

  it("uses the engine's top of lift when thermals are climbable", () => {
    expect(column.topOfLift).toBe(650);
    expect(windgramColumn(tigerHour(undefined, { wStar: 0.6 }), GROUND).topOfLift).toBeNull();
  });

  it('marks cumulus only where thermals reach cloud base', () => {
    expect(column.cumulusBase).toBeNull(); // cloud base 1185 m is above the 650 m top
    const cu = windgramColumn(
      tigerHour(undefined, { estimatedCloudBase: 300, estimatedTopOfLift: GROUND + 300 }),
      GROUND,
    );
    expect(cu.cumulusBase).toBe(GROUND + 300);
  });

  it('carries the lowest level’s cloud down to the ground', () => {
    expect(column.levels[0].cloudCover).toBe(0);
    expect(column.levels.at(-1)!.cloudCover).toBe(80);
  });
});

describe('lapseRateAt', () => {
  const layers = [
    { bottom: 0, top: 200, rate: 3 },
    { bottom: 200, top: 400, rate: 1 },
  ];

  it('holds the end layers beyond their middles', () => {
    expect(lapseRateAt(layers, 0)).toBe(3);
    expect(lapseRateAt(layers, 900)).toBe(1);
  });

  it('interpolates between layer middles', () => {
    expect(lapseRateAt(layers, 200)).toBeCloseTo(2);
  });

  it('is null without layers', () => {
    expect(lapseRateAt([], 100)).toBeNull();
  });
});

describe('levelValueAt', () => {
  it('interpolates linearly between levels', () => {
    const levels = windgramColumn(tigerHour(), GROUND).levels;
    expect(levelValueAt(levels, 1271, (l) => l.temperature)).toBeCloseTo(11, 1);
  });
});

describe('daylightHours', () => {
  const day = Array.from({ length: 24 }, (_, h) =>
    tigerHour(`2026-10-20T${String(h).padStart(2, '0')}:00`),
  );

  it('runs from the sunrise hour to the hour after sunset', () => {
    const hours = daylightHours(day, '2026-10-20T07:31', '2026-10-20T18:12').map((h) => h.time.slice(11, 13));
    expect(hours[0]).toBe('07');
    expect(hours.at(-1)).toBe('19');
  });

  it('stays within 6:00-21:00 on long days', () => {
    const hours = daylightHours(day, '2026-06-21T05:12', '2026-06-21T21:10');
    expect(hours[0].time.slice(11, 13)).toBe('06');
    expect(hours.at(-1)!.time.slice(11, 13)).toBe('21');
  });

  it('shows 7:00-20:00 without sun times', () => {
    expect(daylightHours(day)).toHaveLength(14);
  });
});

describe('altitudeRange', () => {
  const profile = (tops: number[]): AtmosphericProfile => ({
    latitude: 47.5,
    longitude: -122,
    elevation: GROUND,
    timezone: 'America/Los_Angeles',
    fetchedAt: '',
    expiresAt: '',
    hours: tops.map((top, i) =>
      tigerHour(`2026-10-2${i}T13:00`, { estimatedTopOfLift: top }),
    ),
  });

  it('starts at the ground and keeps 1,200 m over the week’s highest top', () => {
    expect(altitudeRange(profile([650, 1500]), 840)).toEqual({ min: 250, max: 3000 });
  });

  it('starts at the launch when it is below the model ground', () => {
    expect(altitudeRange(profile([650]), 120).min).toBe(100);
  });

  it('never runs past the highest level', () => {
    expect(altitudeRange(profile([4000]), 840).max).toBe(3000);
  });
});

describe('sampleGrid', () => {
  it('pads past the chart and interpolates between hours', () => {
    const columns = [
      windgramColumn(tigerHour('2026-10-20T12:00'), GROUND),
      windgramColumn(tigerHour('2026-10-20T13:00'), GROUND),
    ];
    columns[1].layers = columns[1].layers.map((l) => ({ ...l, rate: l.rate + 1 }));
    const { spec, values } = sampleGrid(columns, { min: 300, max: 1300 }, (c, alt) => lapseRateAt(c.layers, alt), 10);
    expect(spec).toMatchObject({ sub: 4, padX: 3, padY: 1, nx: 11, ny: 13, dy: 100, top: 1300 });
    const row = 5; // 1300 - 4 * 100 = 900 m
    const at = (i: number) => values[row * spec.nx + i];
    expect(at(spec.padX + 2) - at(spec.padX)).toBeCloseTo(0.5); // halfway between the hours
    expect(at(0)).toBe(at(spec.padX)); // held beyond the first hour
  });
});
