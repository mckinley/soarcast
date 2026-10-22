import { describe, expect, it } from 'vitest';
import {
  decodeDayWinds,
  directionsInWords,
  encodeDayWinds,
  flownOffListing,
  flownWinds,
  mainFlownDirections,
  usualLaunchHour,
  WIND_FIRST_HOUR,
  WIND_LAST_HOUR,
  type DayWinds,
} from '../flown-winds';
import type { FlownDay } from '../flown-days';

const HOURS = WIND_LAST_HOUR - WIND_FIRST_HOUR + 1;

/** A day with the same wind every hour. */
function day(date: string, direction: number, speed: number): DayWinds {
  return { date, hours: Array.from({ length: HOURS }, () => ({ direction, speed })) };
}

function flownOn(date: string, firstTakeoff = '13:10'): FlownDay {
  return {
    date,
    pilots: 1,
    launches: 1,
    sled: 0,
    soared: 1,
    xc: 0,
    longestMinutes: 60,
    topAltitude: null,
    firstTakeoff,
    lastLanding: null,
  };
}

const date = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);

describe('encodeDayWinds', () => {
  it('keeps the direction to 10 degrees and the speed to 2 km/h', () => {
    const days: DayWinds[] = [
      {
        date: '2025-07-14',
        hours: [{ direction: 274, speed: 13.4 }, null, ...Array(HOURS - 2).fill({ direction: 355, speed: 90 })],
      },
    ];
    const back = decodeDayWinds(encodeDayWinds(days));
    expect(back[0].date).toBe('2025-07-14');
    expect(back[0].hours[0]).toEqual({ direction: 270, speed: 14 });
    expect(back[0].hours[1]).toBeNull();
    // 355 rounds to north, and speed tops out at 70
    expect(back[0].hours[2]).toEqual({ direction: 0, speed: 70 });
  });
  it('reads nothing from an empty or missing column', () => {
    expect(decodeDayWinds(null)).toEqual([]);
    expect(decodeDayWinds('')).toEqual([]);
  });
});

describe('usualLaunchHour', () => {
  it('takes the middle first takeoff, within the hours kept', () => {
    expect(usualLaunchHour([flownOn('a', '11:05'), flownOn('b', '12:40'), flownOn('c', '15:00')])).toBe(12);
    expect(usualLaunchHour([flownOn('a', '07:30')])).toBe(WIND_FIRST_HOUR);
    expect(usualLaunchHour([])).toBe(13);
  });
});

describe('flownWinds', () => {
  // 40 days of west wind, 12 of them flown; 20 of south-east, 2 flown; 10 calm, 1 flown
  const winds = [
    ...Array.from({ length: 40 }, (_, i) => day(date(i), 270, 15)),
    ...Array.from({ length: 20 }, (_, i) => day(date(40 + i), 135, 12)),
    ...Array.from({ length: 10 }, (_, i) => day(date(60 + i), 200, 3)),
  ];
  const flown = [
    ...Array.from({ length: 12 }, (_, i) => flownOn(date(i))),
    flownOn(date(40)),
    flownOn(date(41)),
    flownOn(date(60)),
    // Outside the days with winds: left out
    flownOn('2026-06-01'),
  ];

  it('counts the days and flown days with wind from each direction', () => {
    const w = flownWinds(winds, flown, { ideal: [270], ok: [315] })!;
    expect(w.hour).toBe(13);
    expect(w.days).toBe(70);
    expect(w.flownDays).toBe(15);
    const west = w.sectors.find((s) => s.direction === 'W')!;
    expect(west).toEqual({ direction: 'W', days: 40, flown: 12, listed: 'ideal' });
    expect(w.sectors.find((s) => s.direction === 'NW')!.listed).toBe('ok');
    expect(w.sectors.find((s) => s.direction === 'SE')).toMatchObject({ days: 20, flown: 2, listed: null });
    expect(w.calm).toEqual({ days: 10, flown: 1 });
  });

  it('names the main directions and the flown days off the listing', () => {
    const w = flownWinds(winds, flown, { ideal: [270], ok: [] })!;
    expect(mainFlownDirections(w)).toEqual(['W']);
    expect(flownOffListing(w)).toEqual({ days: 2, directions: ['SE'] });
    // No listed directions: nothing to set the flown days against
    expect(flownOffListing(flownWinds(winds, flown, { ideal: [], ok: [] })!)).toBeNull();
  });

  it('is null with too few flown days', () => {
    expect(flownWinds(winds, flown.slice(0, 5), { ideal: [], ok: [] })).toBeNull();
    expect(flownWinds([], flown, { ideal: [], ok: [] })).toBeNull();
  });
});

describe('directionsInWords', () => {
  it('joins compass points', () => {
    expect(directionsInWords(['W'])).toBe('W');
    expect(directionsInWords(['W', 'NW'])).toBe('W and NW');
    expect(directionsInWords(['SW', 'W', 'NW'])).toBe('SW, W and NW');
  });
});
