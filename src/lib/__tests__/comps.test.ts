import { describe, it, expect } from 'vitest';
import {
  compDates,
  compFromPg,
  compLevel,
  compsAround,
  compsBetween,
  compsOn,
  countryFlag,
  countryRegion,
  groupByMonth,
  monthLabel,
  monthsFrom,
  usualMonths,
  type Comp,
} from '../comps';
import type { PgComp } from '../pgsites-client';

function comp(startDate: string, endDate: string, extra: Partial<Comp> = {}): Comp {
  return {
    id: `c-${startDate}`,
    name: 'Test Open',
    startDate,
    endDate,
    place: 'Somewhere',
    countryCode: 'fr',
    country: 'France',
    category: 2,
    discipline: 'xc',
    series: null,
    url: null,
    latitude: 45,
    longitude: 6,
    ...extra,
  };
}

describe('compDates', () => {
  it('writes a comp within a month as one range', () => {
    expect(compDates(comp('2027-07-03', '2027-07-10'))).toBe('Jul 3–10, 2027');
    expect(compDates(comp('2027-07-03', '2027-07-10'), { year: false })).toBe('Jul 3–10');
  });

  it('names both months, and both years across New Year', () => {
    expect(compDates(comp('2027-08-28', '2027-09-04'))).toBe('Aug 28 – Sep 4, 2027');
    expect(compDates(comp('2026-12-30', '2027-01-02'))).toBe('Dec 30, 2026 – Jan 2, 2027');
  });

  it('writes a one-day comp as its date', () => {
    expect(compDates(comp('2027-05-01', '2027-05-01'))).toBe('May 1, 2027');
  });
});

describe('compsOn and compsBetween', () => {
  const comps = [comp('2026-10-18', '2026-10-25'), comp('2026-10-27', '2026-10-30')];

  it('counts the first and last day, end inclusive', () => {
    expect(compsOn(comps, '2026-10-18')).toHaveLength(1);
    expect(compsOn(comps, '2026-10-25')).toHaveLength(1);
    expect(compsOn(comps, '2026-10-26')).toHaveLength(0);
  });

  it('finds comps overlapping a week', () => {
    expect(compsBetween(comps, '2026-10-21', '2026-10-27')).toHaveLength(2);
    expect(compsBetween(comps, '2026-10-31', '2026-11-06')).toHaveLength(0);
  });
});

describe('compsAround', () => {
  it('keeps comps within 25 km and drops unplaced ones', () => {
    const near = comp('2027-01-01', '2027-01-05', { latitude: 45.1, longitude: 6 });
    const far = comp('2027-01-02', '2027-01-05', { latitude: 46, longitude: 6 });
    const unplaced = comp('2027-01-03', '2027-01-05', { latitude: null, longitude: null });
    expect(compsAround([near, far, unplaced], 45, 6)).toEqual([near]);
  });
});

describe('compLevel', () => {
  it('names the World Cup before the category', () => {
    expect(compLevel({ series: 'pwc', category: 2 })).toBe('World Cup');
    expect(compLevel({ series: 'pre-pwc', category: 2 })).toBe('Pre-World Cup');
    expect(compLevel({ series: null, category: 1 })).toBe('Cat 1');
    expect(compLevel({ series: null, category: null })).toBeNull();
  });
});

describe('usualMonths', () => {
  it('names the busiest months in calendar order', () => {
    const past = [
      comp('2019-09-01', '2019-09-07'),
      comp('2018-05-01', '2018-05-07'),
      comp('2019-05-10', '2019-05-17'),
      comp('2021-09-03', '2021-09-10'),
      comp('2022-07-01', '2022-07-08'),
    ];
    expect(usualMonths(past)).toBe('May and Sep');
  });

  it('names a single month and nothing for no comps', () => {
    expect(usualMonths([comp('2020-03-01', '2020-03-05')])).toBe('Mar');
    expect(usualMonths([])).toBeNull();
  });

  it('names at most three months', () => {
    const past = ['01', '02', '03', '04'].map((m) => comp(`2020-${m}-01`, `2020-${m}-05`));
    expect(usualMonths(past)?.split(/, | and /)).toHaveLength(3);
  });
});

describe('groupByMonth', () => {
  it('groups by start month and files comps still on under the first month', () => {
    const groups = groupByMonth(
      [
        comp('2026-11-02', '2026-11-08'),
        comp('2026-09-28', '2026-10-22'),
        comp('2026-10-20', '2026-10-24'),
      ],
      '2026-10',
    );
    expect(groups.map((g) => [g.month, g.comps.length])).toEqual([
      ['2026-10', 2],
      ['2026-11', 1],
    ]);
  });
});

describe('months', () => {
  it('counts months across New Year', () => {
    expect(monthsFrom('2026-11-20', 3)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(monthsFrom('2026-10-20', 18)).toHaveLength(18);
  });

  it('labels a month short or long', () => {
    expect(monthLabel('2027-05')).toBe('May');
    expect(monthLabel('2027-09', { year: true, long: true })).toBe('September 2027');
  });
});

describe('countries', () => {
  it('gives a flag and a region', () => {
    expect(countryFlag('fr')).toBe('🇫🇷');
    expect(countryFlag(null)).toBe('');
    expect(countryRegion('co')).toBe('latin-america');
    expect(countryRegion('mx')).toBe('latin-america');
    expect(countryRegion('tr')).toBe('europe');
    expect(countryRegion('us')).toBe('north-america');
    expect(countryRegion('np')).toBe('asia');
    expect(countryRegion(null)).toBeNull();
  });

  it('maps a pgsites comp with an English country name', () => {
    const pg: PgComp = {
      id: 'fai-1',
      source: 'fai',
      name: 'Colombian Open',
      start_date: '2027-01-10',
      end_date: '2027-01-17',
      place: 'Roldanillo',
      country_code: 'co',
      category: 2,
      discipline: 'xc',
      series: null,
      url: 'https://example.com',
      source_url: null,
      latitude: 4.4,
      longitude: -76.15,
    };
    expect(compFromPg(pg)).toMatchObject({
      startDate: '2027-01-10',
      countryCode: 'co',
      country: 'Colombia',
    });
  });
});
