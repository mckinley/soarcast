import { describe, expect, it } from 'vitest';
import { measureTerrain, siteTerrain, terrainFromMeasure } from '../site-terrain';
import { customSiteToSite } from '../custom-sites';
import { launchSiteToSite } from '../launch-sites';
import type { CustomSite, LaunchSite } from '@/db/schema';

describe('terrainFromMeasure', () => {
  it('calls steep ground that spans a lot of height big mountains', () => {
    expect(terrainFromMeasure(15, 1200)).toBe('mountains'); // Mailbox Peak
    expect(terrainFromMeasure(10, 2300)).toBe('mountains'); // Owens Valley: wide, but huge
    expect(terrainFromMeasure(5, 560)).toBe('hills'); // Tiger Mountain
    expect(terrainFromMeasure(9, 860)).toBe('hills'); // Chelan Butte
    expect(terrainFromMeasure(14, 500)).toBe('hills'); // rough but low hills
    expect(terrainFromMeasure(null, 1200)).toBeNull();
  });

  it("takes the pilot's choice over the measure", () => {
    expect(siteTerrain('hills', 15, 1200)).toBe('hills');
    expect(siteTerrain(null, 15, 1200)).toBe('mountains');
    expect(siteTerrain('', null, null)).toBeNull();
  });
});

describe('measureTerrain', () => {
  // A slope rising to the east at 10% (5.7 degrees), at about 240 m a cell
  const dLat = 1 / 450;
  const latitude = 47.5;
  const dLon = dLat / Math.cos((latitude * Math.PI) / 180);
  const rows = 201;
  const cols = 201;
  const z = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) z[r * cols + c] = c * dLat * 111_320 * 0.1;
  }
  const grid = {
    north: latitude + 100 * dLat,
    west: -121.7 - 100 * dLon,
    dLat,
    dLon,
    rows,
    cols,
    z,
  };

  it('gives the average steepness and the height spanned within the radius', () => {
    const m = measureTerrain(grid, latitude, -121.7);
    expect(m.slope).toBeCloseTo(5.7, 1);
    // 40 km across at 10%, less the lowest and highest 5%
    expect(m.relief).toBeGreaterThan(3000);
    expect(m.relief).toBeLessThan(4000);
  });
});

describe('site converters', () => {
  it('give a private site in big mountains the lower limit unless the pilot set one', () => {
    const row: CustomSite = {
      id: 'a',
      userId: 'u',
      name: 'Mailbox Peak',
      latitude: '47.4669',
      longitude: '-121.6747',
      elevation: 1480,
      maxWindSpeed: 0,
      sharedSiteId: null,
      idealWindDirections: [270],
      okWindDirections: [],
      siteKind: null,
      goal: null,
      notes: null,
      areaId: null,
      terrain: null,
      terrainSlope: 15,
      terrainRelief: 1200,
      createdAt: new Date('2026-10-19T00:00:00Z'),
      updatedAt: new Date('2026-10-19T00:00:00Z'),
    };
    expect(customSiteToSite(row)).toMatchObject({ terrain: 'mountains', maxWindSpeed: 15 });
    expect(customSiteToSite({ ...row, maxWindSpeed: 20 }).maxWindSpeed).toBe(20);
    expect(customSiteToSite({ ...row, terrain: 'hills' }).maxWindSpeed).toBe(25);
    expect(customSiteToSite({ ...row, siteKind: 'ridge' }).maxWindSpeed).toBe(25);
  });

  it('give a listed site the terrain pgsites measured, or the one the pilot chose', () => {
    const site = {
      id: 'l',
      pgsitesId: 'p',
      name: 'Tiger Mountain',
      slug: 'tiger-mountain',
      latitude: 47.4855,
      longitude: -121.9443,
      altitude: 460,
      maxWindSpeed: null,
      windN: 0,
      windNe: 0,
      windE: 0,
      windSe: 0,
      windS: 2,
      windSw: 2,
      windW: 1,
      windNw: 0,
      isThermal: true,
      isSoaring: false,
      isXc: false,
      isHike: false,
      terrainSlope: 5,
      terrainRelief: 560,
      createdAt: new Date('2026-10-19T00:00:00Z'),
      updatedAt: new Date('2026-10-19T00:00:00Z'),
    } as unknown as LaunchSite;
    expect(launchSiteToSite(site, null)).toMatchObject({ terrain: 'hills', maxWindSpeed: 25 });
    const chosen = launchSiteToSite(site, {
      siteKind: null,
      goal: null,
      customMaxWind: null,
      terrain: 'mountains',
    } as never);
    expect(chosen).toMatchObject({ terrain: 'mountains', maxWindSpeed: 15 });
  });
});
