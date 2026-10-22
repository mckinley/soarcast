import { describe, expect, it } from 'vitest';
import { duePlaces, REFRESH_AHEAD_MS, type Place } from '../forecast-refresh';

const now = new Date('2026-10-22T12:00:00Z');
const place = (key: string): Place => ({ key, latitude: 0, longitude: 0 });
const inMinutes = (m: number) => new Date(now.getTime() + m * 60 * 1000);

describe('duePlaces', () => {
  it('refreshes places with no copy, then the copies that expire before the next run', () => {
    const places = [place('fresh'), place('soon'), place('none'), place('expired')];
    const expiries = new Map([
      ['fresh', inMinutes(150)],
      ['soon', inMinutes(45)],
      ['expired', inMinutes(-30)],
    ]);
    expect(duePlaces(places, expiries, now).map((p) => p.key)).toEqual(['none', 'expired', 'soon']);
  });

  it('looks ahead past the next hourly run', () => {
    expect(REFRESH_AHEAD_MS).toBeGreaterThan(60 * 60 * 1000);
    const expiries = new Map([['a', inMinutes(65)]]);
    expect(duePlaces([place('a')], expiries, now)).toHaveLength(1);
  });
});
