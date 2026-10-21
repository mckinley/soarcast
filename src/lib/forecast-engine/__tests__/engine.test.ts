import { describe, it, expect } from 'vitest';
import type { AtmosphericHour, AtmosphericProfile, PressureLevel } from '@/lib/weather-profile';
import {
  evaluateDays,
  evaluateHours,
  launchProfileFromSite,
  verdictSummary,
  type LaunchProfile,
} from '..';
import {
  deriveLaunchConditions,
  gustShareAtLaunch,
  interpolateAtHeight,
  topOfLiftAtLaunch,
} from '../launch-conditions';
import { directionGate, daylightGate, gustGate, stormGate } from '../gates';

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

  it('carries the surface gust spread up to a launch near the model ground', () => {
    // 290 m above the model ground: wind 18.5 km/h there, plus the whole 12 km/h spread
    const hour = hourAt(13, { windSpeed: 10, windAloft: 20, gusts: 22 });
    const c = deriveLaunchConditions(hour, MODEL_ELEVATION, 500);
    expect(c.windGust).toBe(31);
  });

  it('adds less of the gust spread at a launch high above the model ground', () => {
    const hour = hourAt(13, { windSpeed: 10, windAloft: 20, gusts: 22 });
    // 790 m above: 65% of the spread
    expect(deriveLaunchConditions(hour, MODEL_ELEVATION, 1000).windGust).toBe(28);
    // 1,090 m above: half of it
    expect(deriveLaunchConditions(hour, MODEL_ELEVATION, 1300).windGust).toBe(26);
  });

  it('fades the gust spread from 300 m above the model ground to half at 1,000 m', () => {
    expect(gustShareAtLaunch(-100)).toBe(1);
    expect(gustShareAtLaunch(300)).toBe(1);
    expect(gustShareAtLaunch(650)).toBeCloseTo(0.75);
    expect(gustShareAtLaunch(1000)).toBeCloseTo(0.5);
    expect(gustShareAtLaunch(2500)).toBe(0.5);
  });

  it('raises the top of lift by half the launch height above the model ground, up to cloud base', () => {
    // Model ground 200 m, its top of lift 1,200 m, cloud base 2,000 m
    expect(topOfLiftAtLaunch(1200, 200, 1000, 2000)).toBe(1600);
    expect(topOfLiftAtLaunch(1200, 200, 2000, 2000)).toBe(2000);
    expect(topOfLiftAtLaunch(1200, 200, 2000, null)).toBe(2100);
    // A launch below the model ground keeps the model's top
    expect(topOfLiftAtLaunch(1200, 200, 100, 2000)).toBe(1200);
    expect(topOfLiftAtLaunch(null, 200, 1000, 2000)).toBeNull();
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

  it('lets a light cross wind pass in an hour with thermals', () => {
    expect(directionGate({ ...base, windSpeed: 10, windDirection: 270 }, swLaunch).status).toBe(
      'pass',
    );
    expect(
      directionGate({ ...base, windSpeed: 10, windDirection: 270, wStar: 0.5 }, swLaunch).status,
    ).toBe('marginal');
    expect(directionGate({ ...base, windSpeed: 10, windDirection: 315 }, swLaunch).status).toBe(
      'fail',
    );
  });

  it('counts unstable air fully only with showers near', () => {
    const unstable = { ...base, liftedIndex: -3, cape: 600 };
    const veryUnstable = { ...base, liftedIndex: -5, cape: 2000 };
    const showers = { rainSoonMm: 0.5, rainSoonChance: 0 };
    expect(stormGate(unstable).status).toBe('pass');
    expect(stormGate({ ...unstable, ...showers }).status).toBe('marginal');
    expect(stormGate({ ...unstable, rainSoonChance: 40 }).status).toBe('marginal');
    expect(stormGate(veryUnstable).status).toBe('marginal');
    expect(stormGate({ ...veryUnstable, ...showers }).status).toBe('fail');
    // In the tropics only real rain counts, not a trace or a chance of it
    expect(stormGate({ ...veryUnstable, rainSoonMm: 0.1 }, 'low').status).toBe('marginal');
    expect(stormGate({ ...veryUnstable, rainSoonChance: 60 }, 'low').status).toBe('marginal');
    expect(stormGate({ ...veryUnstable, ...showers }, 'low').status).toBe('fail');
  });

  it('flies through thermal gusts but not through gusts over the limit', () => {
    const gusty = { ...base, windSpeed: 8, windGust: 30 };
    expect(gustGate({ ...gusty, wStar: 2.2 }, swLaunch).status).toBe('marginal'); // over 25
    expect(gustGate({ ...gusty, windGust: 24, wStar: 2.2 }, swLaunch).status).toBe('pass');
    expect(gustGate({ ...gusty, windGust: 24, wStar: 0.5 }, swLaunch).status).toBe('marginal');
    expect(gustGate({ ...gusty, windGust: 36, wStar: 2.2 }, swLaunch).status).toBe('fail');
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

  describe('in the tropics, where model rain is little trusted', () => {
    const tropics = (overrides: (h: number) => HourOverrides) => ({
      ...profile(overrides),
      latitude: 4.4,
    });

    it('does not let light rain and a high chance of rain ground the day', () => {
      const day = today(
        tropics((h) => (h >= 6 ? { precipitation: 1.2, precipitationProbability: 95 } : {})),
      );
      expect(day.verdict).toBe('go');
      expect(day.reasons.some((r) => r.startsWith('Rain'))).toBe(false);
      expect(day.rainNote).toMatch(/^Rain in the forecast 06:00-21:00 isn't counted/);
    });

    it('still flags hours with heavy showers', () => {
      const day = today(tropics((h) => (h >= 13 && h < 15 ? { precipitation: 4 } : {})));
      expect(day.verdict).toBe('go');
      expect(day.reasons[0]).toMatch(/^Showers possible \(4 mm\/h\), 13:00-15:00/);
      expect(day.rainNote).toBeNull();
    });

    it('says nothing about rain on a dry day', () => {
      expect(today(tropics(() => ({}))).rainNote).toBeNull();
    });

    it('leaves rain outside the tropics as it was', () => {
      const day = today(profile((h) => (h >= 6 ? { precipitationProbability: 95 } : {})));
      expect(day.verdict).toBe('no');
      expect(day.rainNote).toBeNull();
    });
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
    const day = today(
      profile((h) => (h >= 13 ? { liftedIndex: -5, cape: 2000, precipitation: 1 } : {})),
    );
    expect(day.flyableWindow).toBe('06:00-13:00');
    expect(day.reasons.some((r) => r.startsWith('Thunderstorms likely'))).toBe(true);
  });

  it('closes the window two hours before showers in unstable air', () => {
    const day = today(
      profile((h) => ({ liftedIndex: -3, cape: 800, precipitation: h >= 15 ? 0.2 : 0 })),
    );
    expect(day.verdict).toBe('go');
    expect(day.flyableWindow).toBe('06:00-13:00');
    expect(day.reasons.some((r) => r.startsWith('Thunderstorm risk, 13:00'))).toBe(true);
  });

  it('flies unstable air with no showers in the forecast', () => {
    const day = today(profile(() => ({ liftedIndex: -3, cape: 800 })));
    expect(day.verdict).toBe('go');
    expect(day.flyableWindow).toBe('06:00-21:00');
    expect(day.stormNote).toBe(
      'The air is unstable 05:00-21:00, but no showers are forecast near then. Storms can still build. Watch the clouds.',
    );
    expect(today(profile()).stormNote).toBeNull();
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

describe('flight type', () => {
  it('calls strong, high thermals for hours an XC day', () => {
    const day = today(profile());
    expect(day.flight).toBe('xc');
    expect(day.flightWindow).toBe('09:00-19:00');
    expect(day.greatDay).toBe(true);
  });

  it('calls weaker thermals a thermal day, not a great one', () => {
    const day = today(profile((h) => (h >= 9 && h <= 18 ? { wStar: 1.3 } : {})));
    expect(day.flight).toBe('thermal');
    expect(day.greatDay).toBe(false);
  });

  it('calls lift that barely clears launch a sled ride', () => {
    // Tops out 80 m above a 600 m launch, the Mt. Si case: the model's 480 m
    // plus half the launch's 400 m above the model ground
    const day = today(profile((h) => (h >= 9 && h <= 18 ? { topOfLiftMsl: 480 } : {})));
    expect(day.verdict).toBe('go');
    expect(day.flight).toBe('sled');
    expect(verdictSummary(day)).toBe(
      'Launch window 06:00-21:00: a sled ride, thermals top out 80 m above launch.',
    );
  });

  it('calls thermals that top out 400 m above launch a sled ride', () => {
    const day = today(profile((h) => (h >= 9 && h <= 18 ? { topOfLiftMsl: 800 } : {})));
    expect(day.flight).toBe('sled');
    expect(day.sled).toEqual({ reason: 'low', liftAboveLaunch: 400 });
  });

  it('judges the flight over the marginal hours around a short launch window', () => {
    // A chance of showers from 10:00 to 17:00 leaves 06:00-10:00 as the
    // launch window, but the thermals from 09:00 are still there to fly
    const day = today(profile((h) => (h >= 10 && h < 17 ? { precipitationProbability: 40 } : {})));
    expect(day.verdict).toBe('go');
    expect(day.flyableWindow).toBe('06:00-10:00');
    expect(day.flight).toBe('xc');
    expect(day.flightWindow).toBe('09:00-19:00');
  });

  it('finds ridge lift in steady wind onto the launch', () => {
    const day = today(profile(() => ({ windSpeed: 18, wStar: 0.3 })));
    expect(day.flight).toBe('ridge');
    expect(day.flightWindow).toBe('06:00-21:00');
    expect(day.greatDay).toBe(false);
  });

  it('makes a long ridge day great at a ridge site', () => {
    const day = today(
      profile(() => ({ windSpeed: 18, wStar: 0.3 })),
      { ...swLaunch, kind: 'ridge' },
    );
    expect(day.greatDay).toBe(true);
  });

  it('finds no ridge lift in a cross wind', () => {
    const day = today(profile(() => ({ windSpeed: 18, windDirection: 270, wStar: 0.3 })));
    expect(day.flight).toBe('sled');
  });

  it('only gives what the site can: no ridge soaring at a thermal site', () => {
    const day = today(
      profile(() => ({ windSpeed: 18, wStar: 0.3 })),
      { ...swLaunch, kind: 'thermal' },
    );
    expect(day.flight).toBe('sled');
  });

  it('keeps a sled-only site a sled ride on a big thermal day', () => {
    const day = today(profile(), { ...swLaunch, kind: 'sled' });
    expect(day.flight).toBe('sled');
  });

  it('says why a day is only a sled ride', () => {
    const why = (p: AtmosphericProfile, launch = swLaunch) => {
      const day = today(p, launch);
      expect(day.flight).toBe('sled');
      return verdictSummary(day).split(': ')[1];
    };
    expect(why(profile(() => ({ wStar: 0.6 })))).toBe('a sled ride, thermals too weak to climb.');
    expect(why(profile((h) => (h >= 9 && h <= 18 ? { topOfLiftMsl: 350 } : {})))).toBe(
      'a sled ride, thermals top out below launch.',
    );
    // A ridge site on a light-wind thermal day
    expect(why(profile(), { ...swLaunch, kind: 'ridge' })).toBe(
      'a sled ride, not enough wind onto the ridge to soar.',
    );
    expect(why(profile(), { ...swLaunch, kind: 'sled' })).toBe('a sled ride.');
    // Climbable thermals for one hour only
    expect(why(profile((h) => ({ wStar: h === 12 ? 1.5 : 0.5 })))).toBe(
      'a sled ride, lift too short-lived to stay up.',
    );
  });

  it('has no flight on a day that is not flyable', () => {
    const day = today(profile(() => ({ windSpeed: 15, windDirection: 45 })));
    expect(day.flight).toBeNull();
    expect(day.goalMet).toBe(false);
  });
});

describe('goals', () => {
  const sledDay = profile((h) => (h >= 9 && h <= 18 ? { topOfLiftMsl: 480 } : {}));

  it('makes a sled ride a go when a safe launch is enough', () => {
    expect(today(sledDay, { ...swLaunch, goal: 'launch' }).goalMet).toBe(true);
  });

  it('does not make a sled ride a go when the goal is to soar', () => {
    expect(today(sledDay, { ...swLaunch, goal: 'soar' }).goalMet).toBe(false);
    expect(today(sledDay).goalMet).toBe(false); // soaring is the default goal
  });

  it('only makes great days a go when the goal is a great day', () => {
    const thermalDay = profile((h) => (h >= 9 && h <= 18 ? { wStar: 1.3 } : {}));
    expect(today(thermalDay, { ...swLaunch, goal: 'great' }).goalMet).toBe(false);
    expect(today(profile(), { ...swLaunch, goal: 'great' }).goalMet).toBe(true);
  });

  it('never makes a marginal day a go', () => {
    const day = today(
      profile(() => ({ windSpeed: 22 })),
      { ...swLaunch, goal: 'launch' },
    );
    expect(day.verdict).toBe('marginal');
    expect(day.goalMet).toBe(false);
  });

  it('starts a sled-only site on "safe launch is enough"', () => {
    expect(today(profile(), { ...swLaunch, kind: 'sled' }).goalMet).toBe(true);
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
      'Launch window 06:00-21:00: an XC day, thermals 09:00-19:00 climbing about 2.2 m/s to 1,100 m above launch.',
    );
  });

  it('names the limiting factor on a day that is not flyable', () => {
    const day = today(profile(() => ({ windSpeed: 15, windDirection: 45 })));
    // Sunrise is 05:30, so the span starts with the sunrise hour
    expect(verdictSummary(day)).toBe('Not flyable. NE wind (45°), off the launch, 05:00-21:00.');
  });
});
