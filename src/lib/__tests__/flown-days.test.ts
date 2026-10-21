import { describe, it, expect } from 'vitest';
import {
  checkAgainstFlown,
  flownByMonthToShow,
  flownFrom,
  flownHere,
  flownKey,
  flownShareByMonth,
  type FlownDay,
} from '../flown-days';
import { topMonths, type SeasonDay } from '../seasons';

function rated(date: string, extra: Partial<SeasonDay> = {}): SeasonDay {
  return { date, verdict: 'go', flight: 'thermal', greatDay: false, gate: null, ...extra };
}

function flown(date: string, extra: Partial<FlownDay> = {}): FlownDay {
  return {
    date,
    pilots: 1,
    launches: 1,
    sled: 1,
    soared: 0,
    xc: 0,
    longestMinutes: 10,
    topAltitude: 600,
    firstTakeoff: '12:00',
    lastLanding: '12:10',
    ...extra,
  };
}

describe('flown days query', () => {
  it('asks from the start of the month two years back', () => {
    expect(flownFrom('2026-10-21')).toBe('2024-10-01');
    expect(flownFrom('2026-01-05')).toBe('2024-01-01');
  });

  it('keys a launch by place, height, radius and time zone', () => {
    const q = { latitude: 47.50213, longitude: -122.00912, altitude: 580.4, radiusKm: 2, timeZone: 'America/Los_Angeles' };
    expect(flownKey(q)).toBe('47.5021|-122.0091|580|2|America/Los_Angeles');
    expect(flownKey({ ...q, altitude: null })).toBe('47.5021|-122.0091|-|2|America/Los_Angeles');
  });
});

describe('checkAgainstFlown', () => {
  const season: SeasonDay[] = [
    rated('2025-06-01'), // go, soared: right
    rated('2025-06-02', { flight: 'sled' }), // flyable for soar, a glide down: right
    rated('2025-06-03', { verdict: 'no', flight: null, gate: 'rain' }), // flown anyway: held back for rain
    rated('2025-06-04', { verdict: 'marginal', flight: 'sled', gate: 'gusts' }), // soared anyway
    rated('2025-06-05'), // go, nobody flew
    rated('2025-06-06', { verdict: 'no', flight: null, gate: 'wind' }), // nobody flew
  ];
  const days = [
    flown('2025-06-01', { pilots: 4, launches: 5, sled: 1, soared: 3, xc: 1 }),
    flown('2025-06-02'),
    flown('2025-06-03'),
    flown('2025-06-04', { sled: 0, soared: 1 }),
    flown('2025-07-01'), // outside the season
  ];

  it('counts flown days by what the season called them', () => {
    const check = checkAgainstFlown(season, days, 'soar');
    expect(check.ratedDays).toBe(6);
    expect(check.flownDays).toBe(4);
    expect(check.flownByStatus).toEqual({ go: 1, flyable: 1, marginal: 1, no: 1 });
    expect(check.missedBy).toEqual([
      { reason: 'rain', days: 1 },
      { reason: 'gusts', days: 1 },
    ]);
    expect(check.ratedByStatus.go).toEqual({ days: 2, flown: 1 });
    expect(check.ratedByStatus.no).toEqual({ days: 2, flown: 1 });
  });

  it('counts soaring days the forecast gave only a glide down or nothing', () => {
    const check = checkAgainstFlown(season, days, 'soar');
    expect(check.soaringDays).toBe(2);
    expect(check.soaringCalledSled).toBe(1);
  });

  it('applies the goal: a glide down is a go when launching is enough', () => {
    const check = checkAgainstFlown(season, days, 'launch');
    expect(check.flownByStatus).toEqual({ go: 2, flyable: 0, marginal: 1, no: 1 });
  });

  it('shares flown days by month over the season', () => {
    const shares = flownShareByMonth(season, days);
    expect(shares[5]).toBeCloseTo(4 / 6);
    expect(shares[6]).toBeNull();
  });
});

describe('flownHere', () => {
  const span = { fromDate: '2024-06-01', toDate: '2025-06-30' };

  it('gives the newest days first, and a check only with a season', () => {
    const days = [flown('2025-06-01'), flown('2025-06-02'), flown('2025-06-03'), flown('2025-06-04')];
    const view = flownHere({ ...span, days }, null, 'soar');
    expect(view.flownDays).toBe(4);
    expect(view.recent.map((d) => d.date)).toEqual(['2025-06-04', '2025-06-03', '2025-06-02']);
    expect(view.check).toBeNull();
    expect(view.byMonth).toBeNull();
    expect(flownHere({ ...span, days }, [rated('2025-06-01')], 'soar').check?.flownDays).toBe(1);
  });

  it('shows months on the Season card only with enough flown days', () => {
    const season = Array.from({ length: 30 }, (_, i) => rated(`2025-06-${String(i + 1).padStart(2, '0')}`));
    const few = flownHere({ ...span, days: season.slice(0, 9).map((d) => flown(d.date)) }, season, 'soar');
    const many = flownHere({ ...span, days: season.slice(0, 10).map((d) => flown(d.date)) }, season, 'soar');
    expect(flownByMonthToShow(few)).toBeNull();
    expect(flownByMonthToShow(many)?.[5]).toBeCloseTo(1 / 3);
    expect(flownByMonthToShow(null)).toBeNull();
  });
});

describe('topMonths', () => {
  it('names the months near the top share', () => {
    const top = topMonths([0, 0, 0.1, 0.2, 0.5, 0.6, 0.55, 0.5, 0.2, 0, 0, null]);
    expect(top?.text).toBe('May to Aug');
    expect(top?.share).toBeCloseTo(0.5375);
    expect(topMonths([0, 0, 0, 0.3, 0, 0, 0, 0, 0, 0.29, 0, 0])?.text).toBe('Apr and Oct');
    expect(topMonths([null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
});
