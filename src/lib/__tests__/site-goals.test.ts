import { describe, it, expect } from 'vitest';
import { defaultGoal, isSiteGoal, isSiteKind, meetsGoal, siteKindFromTags } from '../site-goals';

describe('siteKindFromTags', () => {
  it('reads thermal, XC and soaring tags as a kind', () => {
    expect(siteKindFromTags({ thermal: 1, soaring: 0, xc: 0 })).toBe('thermal');
    expect(siteKindFromTags({ thermal: 0, soaring: 0, xc: 1 })).toBe('thermal');
    expect(siteKindFromTags({ thermal: 0, soaring: 1, xc: 0 })).toBe('ridge');
    expect(siteKindFromTags({ thermal: 1, soaring: 1, xc: 1 })).toBe('both');
  });

  it('leaves an untagged site unknown rather than sled-only', () => {
    expect(siteKindFromTags({ thermal: 0, soaring: 0, xc: 0 })).toBeNull();
    expect(siteKindFromTags({})).toBeNull();
  });
});

describe('defaultGoal', () => {
  it('is soaring for thermal and ridge sites', () => {
    expect(defaultGoal('thermal')).toBe('soar');
    expect(defaultGoal('both', true)).toBe('soar');
    expect(defaultGoal(null)).toBe('soar');
  });

  it('is any safe launch for sled sites and untagged hike-and-fly peaks', () => {
    expect(defaultGoal('sled')).toBe('launch');
    expect(defaultGoal(null, true)).toBe('launch');
  });
});

describe('meetsGoal', () => {
  it('needs a go verdict whatever the goal', () => {
    expect(meetsGoal({ verdict: 'marginal', flight: 'xc', greatDay: true }, 'launch')).toBe(false);
  });

  it('asks more of the day as the goal rises', () => {
    const sled = { verdict: 'go' as const, flight: 'sled' as const, greatDay: false };
    const thermal = { verdict: 'go' as const, flight: 'thermal' as const, greatDay: false };
    const xc = { verdict: 'go' as const, flight: 'xc' as const, greatDay: true };
    expect([sled, thermal, xc].map((d) => meetsGoal(d, 'launch'))).toEqual([true, true, true]);
    expect([sled, thermal, xc].map((d) => meetsGoal(d, 'soar'))).toEqual([false, true, true]);
    expect([sled, thermal, xc].map((d) => meetsGoal(d, 'great'))).toEqual([false, false, true]);
  });
});

describe('form values', () => {
  it('accepts only known kinds and goals', () => {
    expect(isSiteKind('ridge')).toBe(true);
    expect(isSiteKind('glider')).toBe(false);
    expect(isSiteGoal('great')).toBe(true);
    expect(isSiteGoal('')).toBe(false);
  });
});
