import { describe, it, expect } from 'vitest';
import {
  AREA_JOIN_KM,
  assignAreas,
  bestSiteDay,
  cleanAreaName,
  defaultAreaName,
  nearestArea,
  type PlacedSite,
} from '../site-areas';
import type { DayScore } from '@/types';

const tiger: PlacedSite = {
  key: 'launch:tiger',
  name: 'Tiger Mountain',
  latitude: 47.49,
  longitude: -121.95,
  areaId: null,
};
const mailbox: PlacedSite = {
  key: 'custom:mailbox',
  name: 'Mailbox Peak',
  latitude: 47.47,
  longitude: -121.67,
  areaId: null,
};
const chelan: PlacedSite = {
  key: 'launch:chelan',
  name: 'Chelan Butte',
  latitude: 47.81,
  longitude: -120.04,
  areaId: null,
};
const roldanillo: PlacedSite = {
  key: 'launch:roldanillo',
  name: 'Roldanillo',
  latitude: 4.42,
  longitude: -76.13,
  areaId: null,
};

function ids() {
  let n = 0;
  return () => `area-${++n}`;
}

describe('assignAreas', () => {
  it('starts an area for the first site and puts sites a day trip away in it', () => {
    const { moves, created } = assignAreas([tiger, mailbox, chelan], new Set(), ids());
    expect(created).toEqual([{ id: 'area-1', name: 'Around Tiger Mountain' }]);
    expect(moves.map((m) => m.areaId)).toEqual(['area-1', 'area-1', 'area-1']);
  });

  it('starts a new area far away, named for the flying area it is in', () => {
    const { moves, created } = assignAreas([tiger, roldanillo], new Set(), ids());
    expect(created.map((a) => a.name)).toEqual(['Around Tiger Mountain', 'Cauca Valley']);
    expect(moves).toEqual([
      { key: tiger.key, areaId: 'area-1' },
      { key: roldanillo.key, areaId: 'area-2' },
    ]);
  });

  it('leaves placed sites where they are and joins new ones to them', () => {
    const placed = { ...tiger, areaId: 'home' };
    const { moves, created } = assignAreas([placed, mailbox], new Set(['home']), ids());
    expect(created).toEqual([]);
    expect(moves).toEqual([{ key: mailbox.key, areaId: 'home' }]);
  });

  it('places a site again when its area is gone', () => {
    const lost = { ...tiger, areaId: 'deleted' };
    const { moves, created } = assignAreas([lost], new Set(), ids());
    expect(created).toHaveLength(1);
    expect(moves).toEqual([{ key: tiger.key, areaId: 'area-1' }]);
  });

  it('joins only within AREA_JOIN_KM', () => {
    // About 1.5 degrees of latitude: 167 km
    const far = { ...tiger, key: 'launch:far', latitude: tiger.latitude + 1.5 };
    expect(AREA_JOIN_KM).toBeLessThan(167);
    const { created } = assignAreas([tiger, far], new Set(), ids());
    expect(created).toHaveLength(2);
  });
});

describe('defaultAreaName', () => {
  it('keeps names to one short line', () => {
    expect(
      defaultAreaName({ ...tiger, name: 'A  very long launch name that goes on and on' }),
    ).toBe('Around A very long launch name that goes');
    expect(cleanAreaName('  Home \n')).toBe('Home');
  });
});

describe('nearestArea', () => {
  it('finds the area with the closest site', () => {
    const areas = [
      { id: 'home', sites: [tiger, chelan] },
      { id: 'colombia', sites: [roldanillo] },
    ];
    expect(nearestArea(areas, { latitude: 47.6, longitude: -122.3 })?.area.id).toBe('home');
    expect(nearestArea(areas, { latitude: 3.45, longitude: -76.53 })?.area.id).toBe('colombia');
    expect(nearestArea([], { latitude: 0, longitude: 0 })).toBeNull();
  });
});

describe('bestSiteDay', () => {
  const day = (date: string, verdict: DayScore['verdict'], goalMet: boolean): DayScore => ({
    date,
    overallScore: 50,
    label: 'Good',
    verdict,
    flyableWindow: null,
    limitingFactor: null,
    reasons: [],
    goalMet,
  });

  it('is a go when any site is', () => {
    const best = bestSiteDay(
      [
        { site: 'tiger', scores: [day('2026-10-22', 'go', false)] },
        { site: 'mailbox', scores: [day('2026-10-22', 'go', true)] },
        { site: 'chelan', scores: [day('2026-10-22', 'no', false)] },
      ],
      '2026-10-22',
    );
    expect(best?.site).toBe('mailbox');
  });

  it('is null when no site has the day', () => {
    expect(bestSiteDay([{ site: 'tiger', scores: [] }], '2026-10-22')).toBeNull();
  });
});
