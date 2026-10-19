import { describe, it, expect } from 'vitest';
import type { AtmosphericHour, AtmosphericProfile, PressureLevel } from '@/lib/weather-profile';
import {
  evaluateDays,
  evaluateHours,
  launchProfileFromSite,
  verdictSummary,
  type LaunchProfile,
} from '..';
import { deriveLaunchConditions, interpolateAtHeight } from '../launch-conditions';
import { directionGate, daylightGate } from '../gates';

const DATE = '2026-07-18';
const MODEL_ELEVATION = 200;
const LEVEL_HEIGHTS: Array<[PressureLevel['pressure'], number]> = [
  [1000, 100],
  [950, 550],
  [900, 1000],
  [850, 1500],
  [800, 2000],
  [700, 3000],
  [600, 4200],
  [500, 5600],
];

interface HourOverrides {
  windSpeed?: number; // km/h, surface and aloft unless windAloft is given
  windDirection?: number;
  windAloft?: number;
  gusts?: number;
  precipitation?: number;
  precipitationProbability?: number;
  cape?: number;
  liftedIndex?: number;
  cloudBaseAgl?: number;
  cloudCoverLow?: number;
  wStar?: number;
  topOfLiftMsl?: number;
}

/** One hour of a pleasant summer thermal day, SW 10 km/h, unless overridden. */
function hourAt(h: number, o: HourOverrides = {}): AtmosphericHour {
  const day = h >= 9 && h <= 18;
  const speed = o.windSpeed ?? 10;
  const aloft = o.windAloft ?? speed;
  const direction = o.windDirection ?? 225;
  return {
    time: `${DATE}T${String(h).padStart(2, '0')}:00`,
    pressureLevels: LEVEL_HEIGHTS.map(([pressure, height]) => ({
      pressure,
      temperature: 22 - height * 0.0065,
      windSpeed: aloft,
      windDirection: direction,
      relativeHumidity: 50,
      geopotentialHeight: height,
      cloudCover: 0,
    })),
    surface: {
      temperature: 22,
      windSpeed: speed,
      windDirection: direction,
      windGusts: o.gusts ?? speed + 5,
      cloudCover: 20,
      cape: o.cape ?? 200,
      precipitationProbability: o.precipitationProbability ?? 0,
      boundaryLayerHeight: day ? 1800 : 100,
      convectiveInhibition: 0,
      liftedIndex: o.liftedIndex ?? 1,
      shortwaveRadiation: day ? 700 : 0,
      dewPoint: 10,
      precipitation: o.precipitation ?? 0,
      cloudCoverLow: o.cloudCoverLow ?? 10,
      visibility: 30000,
    },
    derived: {
      lapseRate: 2.5,
      thermalIndex: 60,
      estimatedCloudBase: o.cloudBaseAgl ?? 1500,
      estimatedTopOfLift: o.topOfLiftMsl ?? (day ? 1700 : null),
      wStar: o.wStar ?? (day ? 2.2 : null),
      freezingLevel: 4000,
      windShearMax: 5,
      odPotential: 0,
    },
  };
}

function profile(overrides: (h: number) => HourOverrides = () => ({})): AtmosphericProfile {
  return {
    latitude: 47.5,
    longitude: -121.9,
    elevation: MODEL_ELEVATION,
    timezone: 'America/Los_Angeles',
    fetchedAt: `${DATE}T00:00:00Z`,
    expiresAt: `${DATE}T03:00:00Z`,
    sunriseByDay: { [DATE]: `${DATE}T05:30` },
    sunsetByDay: { [DATE]: `${DATE}T21:00` },
    hours: Array.from({ length: 24 }, (_, h) => hourAt(h, overrides(h))),
  };
}

const swLaunch: LaunchProfile = {
  elevation: 600,
  goodDirections: [225],
  okDirections: [180, 270],
  maxWindSpeed: 25,
};

function today(p: AtmosphericProfile, launch = swLaunch) {
  return evaluateDays(p, launch)[0];
}

describe('interpolateAtHeight', () => {
  it('interpolates speed linearly between two heights', () => {
    const r = interpolateAtHeight(
      [
        { height: 0, speed: 10, direction: 270, temperature: 20 },
        { height: 1000, speed: 30, direction: 270, temperature: 10 },
      ],
      500,
    );
    expect(r.speed).toBeCloseTo(20);
    expect(r.direction).toBeCloseTo(270);
    expect(r.temperature).toBeCloseTo(15);
  });

  it('averages directions as vectors across north', () => {
    const r = interpolateAtHeight(
      [
        { height: 0, speed: 10, direction: 350, temperature: 0 },
        { height: 100, speed: 10, direction: 10, temperature: 0 },
      ],
      50,
    );
    expect(Math.min(r.direction, 360 - r.direction)).toBeLessThan(1);
  });
});

describe('deriveLaunchConditions', () => {
  it('uses the wind aloft for a launch well above the model ground', () => {
    const hour = hourAt(13, { windSpeed: 5, windAloft: 30 });
    const c = deriveLaunchConditions(hour, MODEL_ELEVATION, 1000);
    expect(c.windSpeed).toBe(30);
  });

  it('uses the surface wind for a launch at the model ground', () => {
    const hour = hourAt(13, { windSpeed: 5, windAloft: 30 });
    const c = deriveLaunchConditions(hour, MODEL_ELEVATION, 150);
    expect(c.windSpeed).toBe(5);
  });

  it('carries the surface gust spread up to the launch', () => {
    const hour = hourAt(13, { windSpeed: 10, windAloft: 20, gusts: 22 });
    const c = deriveLaunchConditions(hour, MODEL_ELEVATION, 1000);
    expect(c.windGust).toBe(32);
  });
});

describe('gates', () => {
  const base = deriveLaunchConditions(hourAt(13), MODEL_ELEVATION, 600);

  it('lets a light wind launch from any direction', () => {
    expect(directionGate({ ...base, windSpeed: 4, windDirection: 45 }, swLaunch).status).toBe(
      'pass',
    );
  });

  it('fails a wind over the back of the launch', () => {
    expect(directionGate({ ...base, windSpeed: 12, windDirection: 45 }, swLaunch).status).toBe(
      'fail',
    );
  });

  it('marks a cross wind marginal', () => {
    expect(directionGate({ ...base, windSpeed: 12, windDirection: 270 }, swLaunch).status).toBe(
      'marginal',
    );
  });

  it('fails an hour after sunset', () => {
    expect(daylightGate({ ...base, hour: 21 }, `${DATE}T05:30`, `${DATE}T21:00`).status).toBe(
      'fail',
    );
    expect(daylightGate({ ...base, hour: 20 }, `${DATE}T05:30`, `${DATE}T21:00`).status).toBe(
      'pass',
    );
  });
});

describe('evaluateDays', () => {
  it('calls a good thermal day a go with a long window', () => {
    const day = today(profile());
    expect(day.verdict).toBe('go');
    expect(day.flyableWindow).toBe('06:00-21:00');
    expect(['Good', 'Great', 'Epic']).toContain(day.label);
    expect(day.topOfLiftAboveLaunch).toBe(1100);
  });

  it('rates a strong thermal day with a tailwind on launch as Poor', () => {
    const day = today(profile(() => ({ windSpeed: 15, windDirection: 45, wStar: 3.5 })));
    expect(day.verdict).toBe('no');
    expect(day.label).toBe('Poor');
    expect(day.limitingFactor).toMatch(/NE wind .* off the launch/);
  });

  it('vetoes a day with rain all day, whatever the thermals', () => {
    const day = today(profile((h) => (h >= 6 ? { precipitation: 1.2 } : {})));
    expect(day.verdict).toBe('no');
    expect(day.label).toBe('Poor');
    expect(day.reasons[0]).toMatch(/^Rain \(1.2 mm\/h\), 06:00-21:00/);
  });

  it('finds the window after the wind drops', () => {
    const day = today(profile((h) => (h < 14 ? { windSpeed: 35 } : {})));
    expect(day.verdict).toBe('go');
    expect(day.flyableWindow).toBe('14:00-21:00');
    expect(day.limitingFactor).toMatch(/^Outside 14:00-21:00: Wind 35 km\/h \(limit 25\)/);
  });

  it('gives each separate span of a reason its own times', () => {
    // Wind off the launch in the morning and evening, on it from 11 to 16
    const day = today(
      profile((h) => (h < 11 || h >= 16 ? { windDirection: 315, windSpeed: 12 } : {})),
    );
    expect(day.flyableWindow).toBe('11:00-16:00');
    expect(day.reasons[0]).toMatch(/off the launch, 05:00-11:00 and 16:00-21:00$/);
    expect(day.limitingGate).toBe('direction');
  });

  it('closes the afternoon when thunderstorms are likely', () => {
    const day = today(profile((h) => (h >= 13 ? { liftedIndex: -5, cape: 2000 } : {})));
    expect(day.flyableWindow).toBe('06:00-13:00');
    expect(day.reasons.some((r) => r.startsWith('Thunderstorms likely'))).toBe(true);
  });

  it('fails a launch sitting in cloud', () => {
    const day = today(profile(() => ({ cloudBaseAgl: 200, cloudCoverLow: 90 })));
    expect(day.verdict).toBe('no');
    expect(day.limitingFactor).toMatch(/^Launch in cloud/);
  });

  it('gives a marginal day at most a Fair rating', () => {
    const day = today(profile(() => ({ windSpeed: 22 })));
    expect(day.verdict).toBe('marginal');
    expect(day.label).toBe('Fair');
  });
});

describe('evaluateHours', () => {
  it('returns one verdict per hour with the gate results', () => {
    const hours = evaluateHours(profile(), swLaunch);
    expect(hours).toHaveLength(24);
    expect(hours[3].status).toBe('fail');
    expect(hours[12].status).toBe('pass');
    expect(hours[12].gates.map((g) => g.gate)).toContain('direction');
  });
});

describe('launchProfileFromSite', () => {
  it('defaults a missing wind limit to a paraglider-sensible 25 km/h', () => {
    const launch = launchProfileFromSite({
      id: 'x',
      name: 'Peak',
      latitude: 47.5,
      longitude: -121.7,
      elevation: 1200,
      idealWindDirections: [270],
      maxWindSpeed: 0,
      createdAt: '',
      updatedAt: '',
    });
    expect(launch.maxWindSpeed).toBe(25);
    expect(launch.okDirections).toEqual([]);
  });
});

describe('verdictSummary', () => {
  it('describes a go day with its window and lift', () => {
    const day = today(profile());
    expect(verdictSummary(day)).toBe(
      'Flyable 06:00-21:00. Thermals to about 2.2 m/s, lift to 1,100 m above launch.',
    );
  });

  it('names the limiting factor on a day that is not flyable', () => {
    const day = today(profile(() => ({ windSpeed: 15, windDirection: 45 })));
    // Sunrise is 05:30, so the span starts with the sunrise hour
    expect(verdictSummary(day)).toBe('Not flyable. NE wind (45°), off the launch, 05:00-21:00.');
  });
});
