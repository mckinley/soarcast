import { describe, expect, it } from 'vitest';
import { anyoneUp, localClock, upNowLines, type UpNowResult } from '../up-now';
import type { FlownDay } from '../flown-days';

const day = (over: Partial<FlownDay> = {}): FlownDay => ({
  date: '2026-06-14',
  pilots: 3,
  launches: 4,
  sled: 1,
  soared: 3,
  xc: 0,
  longestMinutes: 95,
  topAltitude: 1650,
  firstTakeoff: '10:40',
  lastLanding: '15:20',
  ...over,
});

const up = (over: Partial<UpNowResult> = {}): UpNowResult => ({
  query: {
    latitude: 47.5,
    longitude: -122,
    altitude: 580,
    radiusKm: 2,
    airRadiusKm: 10,
    timeZone: 'America/Los_Angeles',
  },
  at: Date.parse('2026-06-14T21:05:00Z') / 1000,
  inAir: 0,
  onLaunch: 0,
  topAltitude: null,
  newestFixAt: null,
  today: null,
  ...over,
});

describe('upNowLines', () => {
  it('says who is up, how high, who is on launch and how today went', () => {
    const result = up({ inAir: 2, onLaunch: 1, topAltitude: 1236, today: day() });
    expect(anyoneUp(result)).toBe(true);
    expect(upNowLines(result, 580)).toEqual([
      '2 pilots in the air within 10 km now.',
      'The highest is 660 m above launch.',
      '1 pilot on launch.',
      '3 pilots launched here today, the first at 10:40.',
    ]);
  });

  it('says when the last pilot landed once nobody is up', () => {
    const result = up({ today: day({ pilots: 1 }) });
    expect(anyoneUp(result)).toBe(false);
    expect(upNowLines(result, 580)).toEqual([
      '1 pilot launched here today, the first at 10:40.',
      'The last landed at 15:20.',
    ]);
  });

  it('leaves out a height close to launch, or without the launch height', () => {
    expect(upNowLines(up({ inAir: 1, topAltitude: 600 }), 580)).toEqual(['1 pilot in the air within 10 km now.']);
    expect(upNowLines(up({ inAir: 1, topAltitude: 400 }), 580)).toEqual([
      '1 pilot in the air within 10 km now.',
      'The highest is 180 m below launch.',
    ]);
    expect(upNowLines(up({ inAir: 1, topAltitude: 1500 }), null)).toEqual(['1 pilot in the air within 10 km now.']);
  });

  it('gives nothing when nobody flew yet', () => {
    expect(upNowLines(up(), 580)).toBeNull();
  });
});

describe('localClock', () => {
  it('reads the time at the launch', () => {
    expect(localClock(up().at, 'America/Los_Angeles')).toBe('14:05');
  });
});
