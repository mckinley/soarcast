import { describe, it, expect } from 'vitest';
import {
  generateSlug,
  orientationsToIdealDirections,
  mapParaglidingEarthSite,
} from '../paraglidingearth';

describe('ParaglidingEarth Scraper', () => {
  describe('generateSlug', () => {
    it('converts site name to lowercase kebab-case', () => {
      expect(generateSlug('Tiger Mountain')).toBe('tiger-mountain');
    });

    it('removes special characters', () => {
      expect(generateSlug("Mt. Baker's Peak")).toBe('mt-bakers-peak');
    });

    it('handles multiple spaces', () => {
      expect(generateSlug('My   Favorite    Site')).toBe('my-favorite-site');
    });

    it('handles leading and trailing spaces', () => {
      expect(generateSlug('  Poo Poo Point  ')).toBe('poo-poo-point');
    });

    it('handles accented characters', () => {
      expect(generateSlug("Château-d'Oex")).toBe('chteau-doex');
    });

    it('handles empty or whitespace-only strings', () => {
      expect(generateSlug('')).toBe('');
      expect(generateSlug('   ')).toBe('');
    });
  });

  describe('orientationsToIdealDirections', () => {
    it('returns empty array when no orientations provided', () => {
      expect(orientationsToIdealDirections(undefined)).toEqual([]);
      expect(orientationsToIdealDirections({})).toEqual([]);
    });

    it('converts orientation rating of 2 to degrees', () => {
      const orientations = { N: 2, E: 1, S: 0 };
      expect(orientationsToIdealDirections(orientations)).toEqual([0]); // Only N (0°) is rated 2
    });

    it('handles multiple good orientations', () => {
      const orientations = { N: 2, NE: 2, E: 2 };
      expect(orientationsToIdealDirections(orientations)).toEqual([0, 45, 90]);
    });

    it('sorts directions in ascending order', () => {
      const orientations = { W: 2, N: 2, E: 2, S: 2 };
      expect(orientationsToIdealDirections(orientations)).toEqual([0, 90, 180, 270]);
    });

    it('handles all compass directions', () => {
      const orientations = {
        N: 2,
        NE: 2,
        E: 2,
        SE: 2,
        S: 2,
        SW: 2,
        W: 2,
        NW: 2,
      };
      expect(orientationsToIdealDirections(orientations)).toEqual([
        0, 45, 90, 135, 180, 225, 270, 315,
      ]);
    });

    it('ignores ratings of 0 and 1', () => {
      const orientations = { N: 0, NE: 1, E: 2, SE: 1, S: 0 };
      expect(orientationsToIdealDirections(orientations)).toEqual([90]); // Only E is rated 2
    });
  });

  describe('mapParaglidingEarthSite', () => {
    it('maps basic site data correctly', () => {
      const site = {
        name: 'Tiger Mountain',
        lat: '47.4774',
        lng: '-121.9913',
        takeoff_altitude: '914',
        landing_altitude: '152',
        orientations: { W: 2, NW: 2 },
        paragliding: 1,
        hanggliding: 0,
        country: 'US',
        region: 'Washington',
        description: 'Popular training hill',
      };

      const mapped = mapParaglidingEarthSite(site);

      expect(mapped.name).toBe('Tiger Mountain');
      expect(mapped.slug).toBe('tiger-mountain');
      expect(mapped.latitude).toBe('47.4774');
      expect(mapped.longitude).toBe('-121.9913');
      expect(mapped.elevation).toBe(914);
      expect(mapped.landingElevation).toBe(152);
      expect(mapped.countryCode).toBe('US');
      expect(mapped.region).toBe('Washington');
      expect(mapped.description).toBe('Popular training hill');
      expect(mapped.source).toBe('paraglidingearth');
      expect(mapped.sourceId).toBe('47.4774_-121.9913');
      expect(mapped.siteType).toBe('takeoff');
      expect(mapped.flyingTypes).toEqual(['paragliding']);
      expect(mapped.idealWindDirections).toEqual([270, 315]); // W, NW
      expect(mapped.orientations).toEqual({ W: 2, NW: 2 });
    });

    it('handles both paragliding and hanggliding', () => {
      const site = {
        name: 'Test Site',
        lat: '0',
        lng: '0',
        paragliding: 1,
        hanggliding: 1,
      };

      const mapped = mapParaglidingEarthSite(site);
      expect(mapped.flyingTypes).toEqual(['paragliding', 'hanggliding']);
    });

    it('handles missing optional fields', () => {
      const site = {
        name: 'Minimal Site',
        lat: '0',
        lng: '0',
      };

      const mapped = mapParaglidingEarthSite(site);

      expect(mapped.elevation).toBeNull();
      expect(mapped.landingElevation).toBeNull();
      expect(mapped.description).toBeNull();
      expect(mapped.orientations).toBeNull();
      expect(mapped.flyingTypes).toBeNull();
      expect(mapped.idealWindDirections).toBeNull();
      expect(mapped.maxWindSpeed).toBeNull();
    });

    it('generates unique sourceId from coordinates', () => {
      const site1 = { name: 'Site A', lat: '47.123', lng: '-122.456' };
      const site2 = { name: 'Site B', lat: '47.789', lng: '-122.987' };

      const mapped1 = mapParaglidingEarthSite(site1);
      const mapped2 = mapParaglidingEarthSite(site2);

      expect(mapped1.sourceId).toBe('47.123_-122.456');
      expect(mapped2.sourceId).toBe('47.789_-122.987');
      expect(mapped1.sourceId).not.toBe(mapped2.sourceId);
    });

    it('includes landing coordinates when provided', () => {
      const site = {
        name: 'Site with Landing',
        lat: '47.0',
        lng: '-122.0',
        landing_lat: '46.9',
        landing_lng: '-121.9',
        landing_description: 'Large field',
      };

      const mapped = mapParaglidingEarthSite(site);

      expect(mapped.landingLat).toBe('46.9');
      expect(mapped.landingLng).toBe('-121.9');
      expect(mapped.landingDescription).toBe('Large field');
    });

    it('sets lastSyncedAt timestamp', () => {
      const site = {
        name: 'Test',
        lat: '0',
        lng: '0',
      };

      const beforeTime = Date.now();
      const mapped = mapParaglidingEarthSite(site);
      const afterTime = Date.now();

      expect(mapped.lastSyncedAt).toBeInstanceOf(Date);
      const syncTime = (mapped.lastSyncedAt as Date).getTime();
      expect(syncTime).toBeGreaterThanOrEqual(beforeTime);
      expect(syncTime).toBeLessThanOrEqual(afterTime);
    });
  });
});
