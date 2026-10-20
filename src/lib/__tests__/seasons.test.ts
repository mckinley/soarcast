import { describe, it, expect } from 'vitest';
import {
  anyGoShares,
  bestMonths,
  decodeSeasonDays,
  encodeSeasonDays,
  launchProfileKey,
  lostReason,
  seasonDayFromScore,
  seasonMonths,
  typicalWeekGoDays,
  type SeasonDay,
} from '../seasons';
import type { DayScore } from '@/types';

function day(date: string, extra: Partial<SeasonDay> = {}): SeasonDay {
  return { date, verdict: 'go', flight: 'thermal', greatDay: false, gate: null, ...extra };
}

/** Every day of a month in a year, the first `go` of them thermal go days, the rest rained off. */
function month(year: number, m: number, go: number): SeasonDay[] {
  const n = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => {
    const date = `${year}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    return i < go ? day(date) : day(date, { verdict: 'no', flight: null, gate: 'rain' });
  });
}

describe('season day encoding', () => {
  it('round-trips days', () => {
    const days: SeasonDay[] = [
      day('2025-07-14', { flight: 'xc', greatDay: true }),
      day('2025-07-15', { verdict: 'marginal', flight: 'sled', gate: 'gusts' }),
      day('2025-07-16', { verdict: 'no', flight: null, gate: 'rain' }),
    ];
    const encoded = encodeSeasonDays(days);
    expect(encoded).toBe('20250714gx1-,20250715ms0u,20250716n-0r');
    expect(decodeSeasonDays(encoded)).toEqual(days);
    expect(decodeSeasonDays('')).toEqual([]);
  });

  it('keeps the limiting check only on days that were held back', () => {
    const score = {
      date: '2025-07-14',
      verdict: 'go',
      flight: 'ridge',
      greatDay: false,
      limitingGate: 'wind',
    } as DayScore;
    expect(seasonDayFromScore(score).gate).toBeNull();
    expect(seasonDayFromScore({ ...score, verdict: 'no' }).gate).toBe('wind');
  });
});

describe('seasonMonths', () => {
  const days = [...month(2025, 7, 20), ...month(2026, 7, 10), ...month(2025, 12, 0)];

  it('sums go days by calendar month across years', () => {
    const months = seasonMonths(days, 'soar');
    expect(months[6].days).toBe(62);
    expect(months[6].counts.go).toBe(30);
    expect(months[6].goShare).toBeCloseTo(30 / 62);
    expect(months[11].goShare).toBe(0);
    expect(months[0].days).toBe(0);
    expect(months[6].lost[0]).toEqual({ reason: 'rain', days: 32 });
  });

  it('judges days for the goal', () => {
    const sled = [day('2025-05-01', { flight: 'sled' })];
    expect(seasonMonths(sled, 'launch')[4].counts.go).toBe(1);
    expect(seasonMonths(sled, 'soar')[4].counts.flyable).toBe(1);
    expect(lostReason(sled[0], 'soar')).toBe('weak');
    expect(lostReason(sled[0], 'launch')).toBeNull();
  });
});

describe('anyGoShares', () => {
  it('counts a day as a go when any launch in the area was', () => {
    // One launch flies the first 10 days of July, the other days 6 to 20
    const a = month(2025, 7, 10);
    const b = month(2025, 7, 20).map((d, i) =>
      i < 5 ? { ...d, verdict: 'no' as const, flight: null, gate: 'wind' } : d,
    );
    const shares = anyGoShares([a, b], 'soar');
    expect(shares[6]).toBeCloseTo(20 / 31);
    expect(shares[0]).toBe(0);
    expect(anyGoShares([a], 'soar')[6]).toBeCloseTo(10 / 31);
  });
});

describe('bestMonths', () => {
  it('reads a run of months as a range', () => {
    const days = [
      ...month(2025, 6, 18),
      ...month(2025, 7, 20),
      ...month(2025, 8, 19),
      ...month(2025, 10, 5),
    ];
    expect(bestMonths(seasonMonths(days, 'soar'))?.text).toBe('Jun to Aug');
  });

  it('runs across New Year', () => {
    const days = [
      ...month(2025, 12, 20),
      ...month(2025, 1, 20),
      ...month(2025, 2, 21),
      ...month(2025, 6, 2),
    ];
    expect(bestMonths(seasonMonths(days, 'soar'))?.text).toBe('Dec to Feb');
  });

  it('lists months apart, and nothing when no day is a go', () => {
    const days = [...month(2025, 4, 20), ...month(2025, 9, 20), ...month(2025, 6, 3)];
    expect(bestMonths(seasonMonths(days, 'soar'))?.text).toBe('Apr and Sep');
    expect(bestMonths(seasonMonths(month(2025, 3, 0), 'soar'))).toBeNull();
  });
});

describe('typicalWeekGoDays', () => {
  it('is the go share around the same date in past years, times seven', () => {
    const days = [...month(2025, 7, 31), ...month(2025, 8, 0)];
    expect(typicalWeekGoDays(days, 'soar', '2026-07-10')).toBe(7);
    expect(typicalWeekGoDays(days, 'soar', '2026-08-20')).toBe(0);
  });

  it('wraps around New Year and needs enough days', () => {
    const days = [...month(2024, 12, 31), ...month(2025, 1, 31)];
    expect(typicalWeekGoDays(days, 'soar', '2026-12-28')).toBe(7);
    expect(typicalWeekGoDays(days.slice(0, 5), 'soar', '2026-12-03')).toBeNull();
  });
});

describe('launchProfileKey', () => {
  it('ignores direction order and the goal, not the wind limit', () => {
    const base = {
      elevation: 900,
      goodDirections: [270, 225],
      okDirections: [],
      maxWindSpeed: 25,
      kind: null,
    };
    expect(launchProfileKey(base)).toBe(
      launchProfileKey({ ...base, goodDirections: [225, 270], goal: 'great' }),
    );
    expect(launchProfileKey(base)).not.toBe(launchProfileKey({ ...base, maxWindSpeed: 30 }));
  });
});
