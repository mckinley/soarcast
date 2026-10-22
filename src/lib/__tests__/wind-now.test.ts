import { describe, expect, it } from 'vitest';
import {
  compassPoint,
  freshStations,
  heightText,
  nearQuery,
  nearestStations,
  readingText,
  toWindStation,
  windColor,
  withinQuery,
  type WindsMobiStation,
} from '../wind-now';

const NOW = Date.parse('2026-10-22T18:00:00Z') / 1000;

const station = (
  over: Partial<WindsMobiStation> & { at?: number; lat?: number; lon?: number },
): WindsMobiStation => ({
  _id: over._id ?? 'pioupiou-1',
  short: 'Launch station',
  alt: 1050,
  loc: { coordinates: [over.lon ?? 11.73, over.lat ?? 45.79] },
  'pv-code': 'pioupiou',
  'pv-name': 'openwindmap.org',
  url: { default: 'https://www.openwindmap.org/PP1' },
  last: { _id: over.at ?? NOW - 300, 'w-dir': 315, 'w-avg': 12.4, 'w-max': 19.6 },
  ...over,
});

describe('reading stations', () => {
  it('keeps what a site page shows', () => {
    expect(toWindStation(station({}))).toEqual({
      id: 'pioupiou-1',
      name: 'Launch station',
      provider: 'openwindmap.org',
      url: 'https://www.openwindmap.org/PP1',
      latitude: 45.79,
      longitude: 11.73,
      altitude: 1050,
      at: NOW - 300,
      direction: 315,
      speed: 12.4,
      gust: 19.6,
    });
  });

  it('leaves out Holfuy stations and stations without wind', () => {
    expect(toWindStation(station({ 'pv-code': 'holfuy', 'pv-name': 'holfuy.com' }))).toBeNull();
    expect(toWindStation(station({ last: { _id: NOW } }))).toBeNull();
    expect(toWindStation(station({ loc: {} }))).toBeNull();
  });

  it('drops a gust below the average', () => {
    expect(
      toWindStation(station({ last: { _id: NOW, 'w-dir': 10, 'w-avg': 9, 'w-max': 4 } }))?.gust,
    ).toBeNull();
  });

  it('keeps only fresh readings', () => {
    const answer = [
      station({ _id: 'a', at: NOW - 60 * 60 }),
      station({ _id: 'b', at: NOW - 3 * 60 * 60 }),
      'not a station',
    ];
    expect(freshStations(answer, NOW).map((s) => s.id)).toEqual(['a']);
    expect(freshStations({ detail: 'error' }, NOW)).toEqual([]);
  });

  it('lists the nearest stations within reach, nearest first', () => {
    const stations = freshStations(
      [
        station({ _id: 'far', lat: 46.5, lon: 11.73 }), // about 79 km
        station({ _id: 'mid', lat: 45.9, lon: 11.73 }),
        station({ _id: 'near', lat: 45.8, lon: 11.73 }),
      ],
      NOW,
    );
    const near = nearestStations(stations, 45.79, 11.73);
    expect(near.map((s) => s.id)).toEqual(['near', 'mid']);
    expect(near[0].distanceKm).toBeLessThan(2);
  });
});

describe('queries', () => {
  it('asks for fresh stations near a launch with only the needed fields', () => {
    const url = new URL(nearQuery(45.7834, 11.7312));
    expect(url.origin + url.pathname).toBe('https://winds.mobi/api/2.3/stations/');
    expect(url.searchParams.get('near-lat')).toBe('45.783');
    expect(url.searchParams.get('near-distance')).toBe('50000');
    expect(url.searchParams.get('last-measure')).toBe('5400');
    expect(url.searchParams.getAll('keys')).toContain('last.w-avg');
  });

  it('asks for the stations in a map view', () => {
    const url = new URL(withinQuery(45.5, 11, 46.2, 12.5));
    expect(url.searchParams.get('within-pt1-lat')).toBe('46.200');
    expect(url.searchParams.get('within-pt2-lon')).toBe('12.500');
    expect(url.searchParams.get('is-highest-duplicates-rating')).toBe('true');
  });
});

describe('words and colours', () => {
  it('names the compass point', () => {
    expect([0, 22, 23, 90, 200, 337, 338, 359].map(compassPoint)).toEqual([
      'N',
      'N',
      'NE',
      'E',
      'S',
      'NW',
      'N',
      'N',
    ]);
  });

  it('says a reading in words', () => {
    expect(readingText({ direction: 315, speed: 12.4, gust: 19.6 })).toBe('NW 12 km/h, gusts 20');
    expect(readingText({ direction: 90, speed: 6, gust: null })).toBe('E 6 km/h');
    expect(readingText({ direction: 0, speed: 0, gust: null })).toBe('Calm');
  });

  it('says where a station sits against the launch', () => {
    expect(heightText(1050, 1000)).toBe('at launch height');
    expect(heightText(400, 1000)).toBe('600 m below launch');
    expect(heightText(1400, 1000)).toBe('400 m above launch');
    expect(heightText(null, 1000)).toBeNull();
    expect(heightText(400, null)).toBeNull();
  });

  it('colours arrows by the stronger of average and gust', () => {
    expect(windColor({ speed: 8, gust: 12 })).toBe('green');
    expect(windColor({ speed: 10, gust: 16 })).toBe('amber');
    expect(windColor({ speed: 12, gust: 30 })).toBe('red');
  });
});
