import { describe, it, expect } from 'vitest';
import { compassPoint, windBarbPath, windSpeedToBarb } from './wind-barb-utils';

describe('windSpeedToBarb', () => {
  it('is calm under 2.5 km/h', () => {
    expect(windSpeedToBarb(0, 180)).toMatchObject({ calm: true, speedKmh: 0 });
    expect(windSpeedToBarb(2.4, 180)).toMatchObject({ calm: true, speedKmh: 0 });
  });

  it('counts km/h: short feather 5, long 10, flag 50', () => {
    expect(windSpeedToBarb(4, 0)).toMatchObject({ flags: 0, fullBarbs: 0, halfBarbs: 1, speedKmh: 5 });
    expect(windSpeedToBarb(24, 0)).toMatchObject({ flags: 0, fullBarbs: 2, halfBarbs: 1, speedKmh: 25 });
    expect(windSpeedToBarb(31, 0)).toMatchObject({ flags: 0, fullBarbs: 3, halfBarbs: 0, speedKmh: 30 });
    expect(windSpeedToBarb(63, 0)).toMatchObject({ flags: 1, fullBarbs: 1, halfBarbs: 1, speedKmh: 65 });
  });

  it('keeps the direction the wind comes from', () => {
    expect(windSpeedToBarb(20, 225).direction).toBe(225);
  });
});

describe('windBarbPath', () => {
  it('draws the shaft up from the station', () => {
    expect(windBarbPath(windSpeedToBarb(10, 0), 20)).toMatch(/^M0 0V-20/);
  });

  it('puts feathers on the clockwise side, leaning away from the station', () => {
    const path = windBarbPath(windSpeedToBarb(10, 0), 20);
    const [, x, y] = path.match(/M0 -20L([\d.]+) (-[\d.]+)/)!;
    expect(Number(x)).toBeGreaterThan(0);
    expect(Number(y)).toBeLessThan(-20);
  });

  it('sets a lone short feather in from the tip', () => {
    const path = windBarbPath(windSpeedToBarb(5, 0), 20);
    expect(path).not.toMatch(/M0 -20L/);
    expect(path.match(/M0 -[\d.]+L/g)).toHaveLength(1);
  });

  it('draws a flag as a closed triangle', () => {
    expect(windBarbPath(windSpeedToBarb(50, 0), 20)).toMatch(/Z/);
  });
});

describe('compassPoint', () => {
  it.each([
    [0, 'N'],
    [359, 'N'],
    [-10, 'N'],
    [225, 'SW'],
    [100, 'E'],
    [292, 'WNW'],
  ])('%s° is %s', (deg, point) => {
    expect(compassPoint(deg)).toBe(point);
  });
});
