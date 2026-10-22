import { describe, expect, it } from 'vitest';
import {
  aboutPerYear,
  mainMonths,
  nogaPage,
  parseNoga,
  regionFlights,
  siteFlights,
  type NogaTakeoff,
} from '../noga';

const months = (m: Record<number, number>) => Array.from({ length: 12 }, (_, i) => m[i + 1] ?? 0);

function takeoff(
  id: string,
  siteId: string,
  regionId: string,
  latitude: number,
  longitude: number,
  byMonth: number[],
): NogaTakeoff {
  const flights = byMonth.reduce((s, n) => s + n, 0);
  return {
    id,
    name: id,
    countryCode: 'co',
    latitude,
    longitude,
    siteId,
    siteName: `site ${siteId}`,
    regionId,
    regionName: `region ${regionId}`,
    flights,
    years: 11,
    byMonth,
    avgPoints: 150,
    maxPoints: flights,
  };
}

// Two takeoffs of one site, a third of another site in the same region, a
// fourth far away in another region
const TAKEOFFS = [
  takeoff('pg-takeoff-1', 'pg-site-1', 'pg-region-1', 4.4044, -76.2109, months({ 1: 440, 2: 330 })),
  takeoff('pg-takeoff-2', 'pg-site-1', 'pg-region-1', 4.394, -76.21, months({ 1: 22, 12: 11 })),
  takeoff('pg-takeoff-3', 'pg-site-2', 'pg-region-1', 4.6, -76.1, months({ 1: 11 })),
  takeoff('pg-takeoff-4', 'pg-site-3', 'pg-region-2', 45.85, 6.22, months({ 6: 55 })),
];

describe('parseNoga', () => {
  const feature = (props: Record<string, unknown>, coords = [-76.21, 4.4]) => ({
    geometry: { type: 'Point', coordinates: coords as [number, number] },
    properties: props,
  });
  it('joins each takeoff to its site and region', () => {
    const rows = parseNoga(
      {
        features: [
          feature({
            id: 'pg-takeoff-1',
            name: 'Roldanillo',
            country: 'CO',
            site_id: 'pg-site-1',
            total_flights: 22,
            avg_flights_per_year: 2,
            avg_points: 140.5,
            max_points: 300,
            flights_by_month: months({ 1: 20, 2: 2 }),
          }),
          // No months: left out
          feature({
            id: 'pg-takeoff-2',
            name: 'x',
            country: 'CO',
            site_id: 'pg-site-1',
            total_flights: 5,
          }),
        ],
      },
      { features: [feature({ id: 'pg-site-1', name: 'Roldanillo', region_id: 'pg-region-9' })] },
      { features: [feature({ id: 'pg-region-9', name: 'Valle del Cauca' })] },
    );
    expect(rows).toEqual([
      {
        id: 'pg-takeoff-1',
        name: 'Roldanillo',
        countryCode: 'co',
        latitude: 4.4,
        longitude: -76.21,
        siteId: 'pg-site-1',
        siteName: 'Roldanillo',
        regionId: 'pg-region-9',
        regionName: 'Valle del Cauca',
        flights: 22,
        years: 11,
        byMonth: months({ 1: 20, 2: 2 }),
        avgPoints: 140.5,
        maxPoints: 300,
      },
    ]);
  });
});

describe('siteFlights', () => {
  it('adds up the site of the nearest takeoff', () => {
    const f = siteFlights(TAKEOFFS, 4.405, -76.211)!;
    expect(f.name).toBe('site pg-site-1');
    expect(f.href).toBe(nogaPage('pg-site-1'));
    expect(f.flights).toBe(803);
    expect(f.perYear[0]).toBeCloseTo(462 / 11);
    expect(f.perYear[11]).toBeCloseTo(1);
  });
  it('is null when no takeoff is within 3 km', () => {
    expect(siteFlights(TAKEOFFS, 4.5, -76.211)).toBeNull();
  });
});

describe('regionFlights', () => {
  it('adds up every takeoff in the regions the launches are in', () => {
    const f = regionFlights(TAKEOFFS, [{ latitude: 4.6, longitude: -76.1 }])!;
    expect(f.name).toBe('region pg-region-1');
    expect(f.flights).toBe(814);
  });
  it('names several regions by count, with no single page', () => {
    const f = regionFlights(TAKEOFFS, [
      { latitude: 4.6, longitude: -76.1 },
      { latitude: 45.85, longitude: 6.22 },
    ])!;
    expect(f.name).toBe('2 regions');
    expect(f.href).toBeNull();
    expect(f.flights).toBe(869);
  });
});

describe('mainMonths', () => {
  it('takes the busiest months until they hold three quarters of the flights', () => {
    expect(mainMonths(months({ 1: 40, 2: 30, 3: 2, 12: 3 }))).toBe('Jan and Feb');
    expect(mainMonths(months({ 4: 67, 5: 78, 6: 59, 7: 86, 8: 40, 9: 10 }))).toBe('Apr to Jul');
    expect(mainMonths(months({}))).toBeNull();
  });
});

describe('aboutPerYear', () => {
  it('rounds to a count a pilot reads at a glance', () => {
    expect(aboutPerYear(0)).toBe('none');
    expect(aboutPerYear(0.4)).toBe('under 1');
    expect(aboutPerYear(4.4)).toBe('about 4');
    expect(aboutPerYear(1238)).toBe('about 1,240');
  });
});

describe('nogaPage', () => {
  it('links NOGA’s English page for the place', () => {
    expect(nogaPage('pg-region-22')).toBe(
      'https://noga.es/paragliding/map/en/region_pg-region-22.html',
    );
  });
});
