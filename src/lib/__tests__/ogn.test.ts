import { describe, expect, it } from 'vitest';
import {
  boxAround,
  ognAnyUp,
  ognLines,
  ognNowNear,
  ognQuery,
  parseOgnMarkers,
  type OgnNow,
} from '../ogn';

// lat,lon,cn,registration,alt,time,age,track,speed,climb,type,receiver,device,key
const marker = (o: Partial<Record<string, string | number>> = {}) => {
  const f = {
    lat: 45.79,
    lon: 11.73,
    cn: 'AB',
    reg: 'D-1234',
    alt: 1800,
    time: '12:00:00',
    age: 20,
    track: 90,
    speed: 32,
    climb: 1.8,
    type: 7,
    rx: 'Grappa',
    dev: 'DD1234',
    key: 'k1',
    ...o,
  };
  return `<m a="${Object.values(f).join(',')}"/>`;
};
const xml = (...markers: string[]) => `<?xml version="1.0"?><markers>${markers.join('')}</markers>`;

describe('reading OGN', () => {
  it('keeps gliders, hang gliders and paragliders in the air, without who they are', () => {
    const [a] = parseOgnMarkers(xml(marker()));
    expect(a).toEqual({
      key: 'k1',
      kind: 'paraglider',
      latitude: 45.79,
      longitude: 11.73,
      altitude: 1800,
      age: 20,
      track: 90,
      speed: 32,
      climb: 1.8,
    });
    expect(JSON.stringify(a)).not.toMatch(/AB|D-1234|DD1234/);
  });

  it('leaves out other aircraft, old positions and aircraft on the ground', () => {
    const got = parseOgnMarkers(
      xml(
        marker({ key: 'plane', type: 8 }),
        marker({ key: 'old', age: 900 }),
        marker({ key: 'ground', speed: 0, climb: 0 }),
        marker({ key: 'hg', type: 6 }),
        marker({ key: 'glider', type: 1, speed: 0, climb: 2 }),
      ),
    );
    expect(got.map((a) => a.key)).toEqual(['hg', 'glider']);
  });

  it('asks for a box with north, south, east and west in order', () => {
    const url = new URL(ognQuery(...boxAround(45.79, 11.73, 10)));
    expect(url.origin + url.pathname).toBe('https://live.glidernet.org/lxml.php');
    expect(Number(url.searchParams.get('b'))).toBeCloseTo(45.88, 2);
    expect(Number(url.searchParams.get('c'))).toBeCloseTo(45.7, 2);
    expect(Number(url.searchParams.get('d'))).toBeGreaterThan(11.73);
    expect(Number(url.searchParams.get('e'))).toBeLessThan(11.73);
  });
});

describe('near a launch', () => {
  const aircraft = parseOgnMarkers(
    xml(
      marker({ key: 'p1', alt: 2100 }),
      marker({ key: 'p1', alt: 2150 }),
      marker({ key: 'p2', alt: 1500 }),
      marker({ key: 'h1', type: 6, alt: 1900 }),
      marker({ key: 'g1', type: 1, alt: 2600 }),
      marker({ key: 'far', lat: 46.5 }),
    ),
  );

  it('counts each aircraft once, within reach', () => {
    const now = ognNowNear(aircraft, 45.79, 11.73, 10, 1000);
    expect(now).toEqual({
      at: 1000,
      radiusKm: 10,
      paragliders: 2,
      hangGliders: 1,
      gliders: 1,
      topAltitude: 2150,
    });
    expect(ognAnyUp(now)).toBe(true);
  });

  it('says it in words', () => {
    const now = ognNowNear(aircraft, 45.79, 11.73, 10, 1000);
    expect(ognLines(now, 1000)).toEqual([
      'On OGN: 2 paragliders, 1 hang glider and 1 glider in the air within 10 km.',
      'The highest paraglider or hang glider is 1,150 m above launch.',
    ]);
    const one: OgnNow = { ...now, paragliders: 1, hangGliders: 0, gliders: 0, topAltitude: 900 };
    expect(ognLines(one, 1000)).toEqual([
      'On OGN: 1 paraglider in the air within 10 km.',
      'The paraglider is 100 m below launch.',
    ]);
    expect(ognLines({ ...now, paragliders: 0, hangGliders: 0, gliders: 0 }, 1000)).toBeNull();
  });
});
