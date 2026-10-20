import { describe, it, expect } from 'vitest';
import { calculateLapseRateBetweenLevels, lapseBand, lapseMeaning, LAPSE_BANDS } from './lapse-rate-utils';

describe('calculateLapseRateBetweenLevels', () => {
  it('gives cooling per 1000 ft', () => {
    // 10 °C over 1500 m (4921 ft): about the standard atmosphere's 2 °C/1000ft
    expect(calculateLapseRateBetweenLevels(15, 5, 1500, 3000)).toBeCloseTo(2.03, 2);
  });

  it('puts the dry adiabat, 9.8 °C/km, at 3 °C/1000ft', () => {
    expect(calculateLapseRateBetweenLevels(20, 10.2, 0, 1000)).toBeCloseTo(2.99, 2);
  });

  it('is negative in an inversion', () => {
    expect(calculateLapseRateBetweenLevels(5, 15, 1500, 3000)).toBeLessThan(0);
  });

  it('is null when the upper height is not above the lower', () => {
    expect(calculateLapseRateBetweenLevels(15, 5, 3000, 1500)).toBeNull();
    expect(calculateLapseRateBetweenLevels(15, 5, 1500, 1500)).toBeNull();
  });
});

describe('lapseBand', () => {
  // The RASP windgram's breaks and colors, as canadarasp draws them
  it.each([
    [3.4, 'rgb(255, 61, 61)', 'unstable'],
    [3, 'rgb(255, 61, 61)', 'unstable'],
    [2.7, 'rgb(255, 120, 0)', 'conditional'],
    [2.2, 'rgb(255, 150, 255)', 'conditional'],
    [1.7, 'rgb(204, 191, 255)', 'conditional'],
    [1.3, 'rgb(250, 202, 177)', 'conditional'],
    [0.6, 'rgb(128, 128, 230)', 'stable'],
    [0, 'rgb(128, 128, 230)', 'stable'],
    [-0.3, 'rgb(204, 204, 204)', 'inversion'],
    [-2, 'rgb(153, 153, 153)', 'inversion'],
  ])('puts %s °C/1000ft in %s (%s)', (rate, color, group) => {
    expect(lapseBand(rate)).toMatchObject({ color, group });
  });

  it('lists bands from the strongest inversion up', () => {
    const mins = LAPSE_BANDS.map((b) => b.min);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
  });
});

describe('lapseMeaning', () => {
  it('reads the bands in pilot words', () => {
    expect(lapseMeaning(3.2)).toMatch(/strong thermals/);
    expect(lapseMeaning(2)).toMatch(/good for thermals/);
    expect(lapseMeaning(1.3)).toMatch(/weak/);
    expect(lapseMeaning(0.4)).toMatch(/stable/);
    expect(lapseMeaning(-0.4)).toMatch(/inversion/);
  });
});
