import { describe, it, expect } from 'vitest';
import {
  customSiteToSite,
  directionRatings,
  parseCustomSiteForm,
  sharedSiteBody,
  sharedSiteRef,
} from '../custom-sites';
import { launchProfileFromSite } from '../forecast-engine';
import type { CustomSite } from '@/db/schema';

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const valid = {
  name: ' Mount Si ',
  latitude: '47.48810',
  longitude: '-121.72350',
  elevation: '1260',
  good: '270,315',
  ok: '225,270',
  maxWindSpeed: '22',
  kind: 'thermal',
  goal: 'launch',
  notes: 'Launch is the open slope below Haystack.',
};

describe('parseCustomSiteForm', () => {
  it('parses a complete form', () => {
    const { input, errors } = parseCustomSiteForm(form(valid));
    expect(errors).toEqual({});
    expect(input).toEqual({
      name: 'Mount Si',
      latitude: 47.4881,
      longitude: -121.7235,
      elevation: 1260,
      goodDirections: [270, 315],
      okDirections: [225], // 270 is already good
      maxWindSpeed: 22,
      kind: 'thermal',
      goal: 'launch',
      notes: 'Launch is the open slope below Haystack.',
      share: false,
    });
  });

  it('shares only a site with a wind direction, and never its notes, limit or goal', () => {
    const { input, errors } = parseCustomSiteForm(form({ ...valid, share: 'on' }));
    expect(errors).toEqual({});
    expect(input.share).toBe(true);
    expect(sharedSiteBody(input, 1260)).toEqual({
      name: 'Mount Si',
      latitude: 47.4881,
      longitude: -121.7235,
      altitude: 1260,
      wind: [0, 0, 0, 0, 0, 1, 2, 2], // N..NW
      kind: 'thermal',
    });
    expect(sharedSiteRef('abc')).toBe('soarcast:abc');
    expect(
      parseCustomSiteForm(form({ ...valid, share: 'on', good: '', ok: '' })).errors,
    ).toHaveProperty('share');
  });

  it('leaves an unknown site kind or goal unset', () => {
    const { input } = parseCustomSiteForm(form({ ...valid, kind: '', goal: 'epic' }));
    expect(input.kind).toBeNull();
    expect(input.goal).toBeNull();
  });

  it('leaves a blank elevation for a terrain lookup and defaults the wind limit', () => {
    const { input, errors } = parseCustomSiteForm(
      form({ ...valid, elevation: '', maxWindSpeed: '', good: '', ok: '', notes: ' ' }),
    );
    expect(errors).toEqual({});
    expect(input.elevation).toBeNull();
    expect(input.maxWindSpeed).toBe(25);
    expect(input.goodDirections).toEqual([]);
    expect(input.notes).toBeNull();
  });

  it('requires a name and a pin', () => {
    const { errors } = parseCustomSiteForm(
      form({ ...valid, name: '', latitude: '', longitude: '' }),
    );
    expect(Object.keys(errors).sort()).toEqual(['location', 'name']);
    expect(
      parseCustomSiteForm(form({ ...valid, latitude: '0', longitude: '0' })).errors,
    ).toHaveProperty('location');
  });

  it('rejects impossible numbers and ignores directions off the compass', () => {
    const { input, errors } = parseCustomSiteForm(
      form({
        ...valid,
        elevation: '12000',
        maxWindSpeed: '200',
        latitude: '95',
        good: '270,271,abc',
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(['elevation', 'location', 'maxWindSpeed']);
    expect(input.goodDirections).toEqual([270]);
  });
});

describe('customSiteToSite', () => {
  it('gives the engine both good and cross directions', () => {
    const row: CustomSite = {
      id: 'a',
      userId: 'u',
      name: 'Mount Si',
      latitude: '47.4881',
      longitude: '-121.7235',
      elevation: 1260,
      maxWindSpeed: 22,
      sharedSiteId: null,
      idealWindDirections: [270],
      okWindDirections: [225, 315],
      siteKind: null,
      goal: null,
      notes: null,
      areaId: null,
      createdAt: new Date('2026-10-19T00:00:00Z'),
      updatedAt: new Date('2026-10-19T00:00:00Z'),
    };
    const site = customSiteToSite(row);
    expect(site.latitude).toBe(47.4881);
    expect(site.createdAt).toBe('2026-10-19T00:00:00.000Z');
    expect(launchProfileFromSite(site)).toEqual({
      elevation: 1260,
      goodDirections: [270],
      okDirections: [225, 315],
      maxWindSpeed: 22,
      kind: null,
      goal: 'launch', // a peak the pilot pinned: a safe launch is enough
    });
  });
});

describe('directionRatings', () => {
  it('maps degrees to compass labels', () => {
    expect(directionRatings([270], [225, 315])).toEqual({
      N: 0,
      NE: 0,
      E: 0,
      SE: 0,
      S: 0,
      SW: 1,
      W: 2,
      NW: 1,
    });
  });
});
