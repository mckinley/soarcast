import { describe, it, expect } from 'vitest';
import type { AtmosphericHour, AtmosphericProfile } from '@/lib/weather-profile';
import { dayNumbers, hoursToDescribe, thermalWord } from '../day-numbers';

const DATE = '2026-07-18';

function hourAt(h: number, wind: number, rainChance = 0): AtmosphericHour {
  return {
    time: `${DATE}T${String(h).padStart(2, '0')}:00`,
    pressureLevels: [
      [850, 1500],
      [700, 3000],
    ].map(([pressure, height]) => ({
      pressure: pressure as 850 | 700,
      temperature: 22 - height * 0.0065,
      windSpeed: 30,
      windDirection: 270,
      relativeHumidity: 50,
      geopotentialHeight: height,
      cloudCover: 0,
    })),
    surface: {
      temperature: 22,
      windSpeed: wind,
      windDirection: 225,
      windGusts: wind + 10,
      cloudCover: 20,
      cape: 200,
      precipitationProbability: rainChance,
      boundaryLayerHeight: 1800,
      convectiveInhibition: 0,
      liftedIndex: 1,
      shortwaveRadiation: 700,
      dewPoint: 10,
      precipitation: 0,
      cloudCoverLow: 10,
      visibility: 30000,
    },
    derived: {
      lapseRate: 2.5,
      thermalIndex: 60,
      estimatedCloudBase: 1500,
      estimatedTopOfLift: 1700,
      wStar: 2,
      freezingLevel: 4000,
      windShearMax: 5,
      odPotential: 0,
    },
  };
}

const profile: AtmosphericProfile = {
  latitude: 47.5,
  longitude: -121.9,
  elevation: 200,
  timezone: 'America/Los_Angeles',
  fetchedAt: `${DATE}T00:00:00Z`,
  expiresAt: `${DATE}T03:00:00Z`,
  sunriseByDay: { [DATE]: `${DATE}T06:30` },
  sunsetByDay: { [DATE]: `${DATE}T20:40` },
  hours: Array.from({ length: 24 }, (_, h) => hourAt(h, h < 12 ? 6 : 12, h === 15 ? 40 : 0)),
};

describe('day numbers', () => {
  it('takes the flyable window, end hour excluded', () => {
    const hours = hoursToDescribe(profile, DATE, '11:00-14:00');
    expect(hours.map((h) => h.time.slice(11, 13))).toEqual(['11', '12', '13']);
  });

  it('takes daylight when the day has no window', () => {
    const hours = hoursToDescribe(profile, DATE, null);
    expect(hours[0].time.slice(11, 13)).toBe('06');
    expect(hours.at(-1)!.time.slice(11, 13)).toBe('20');
  });

  it('averages the wind, keeps the top gust and the highest chance of rain', () => {
    const n = dayNumbers(profile, DATE, '11:00-17:00')!;
    expect(n.launchWind).toBe(11); // one hour of 6, five of 12
    expect(n.launchGust).toBe(22);
    expect(n.launchDirection).toBe('SW');
    expect(n.upperWind).toBe(30);
    expect(n.upperDirection).toBe('W');
    expect(n.rainChance).toBe(40);
    expect(n.cloudBaseMsl).toBe(1700); // 1500 m above the model's ground at 200 m
    expect(n.freezingLevelMsl).toBe(4000);
  });

  it('has nothing for a day the profile lacks', () => {
    expect(dayNumbers(profile, '2026-07-19', null)).toBeNull();
  });

  it('names thermal strength', () => {
    expect(thermalWord(null)).toBe('Too weak to climb');
    expect(thermalWord(1.6)).toBe('Moderate');
  });
});
