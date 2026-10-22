import { describe, expect, it } from 'vitest';
import {
  ageText,
  cloudImageryAt,
  cloudSatelliteAt,
  gibsTileUrl,
  kk7SeasonOf,
  kk7TileUrl,
  layerCapabilitiesUrl,
  lightningSourcesAt,
  newestRain,
  newestWmsTime,
  openAipTileUrl,
  sunElevation,
  wrapLongitude,
} from '../map-layers';

describe('kk7 layers', () => {
  it('names the season and time of day in the tile path', () => {
    expect(kk7TileUrl('thermals', 'jul', '07', 'soarcast.example')).toBe(
      'https://thermal.kk7.ch/tiles/thermals_jul_07/{z}/{x}/{y}.png?src=soarcast.example',
    );
    expect(kk7TileUrl('skyways', 'all', 'all', 'x')).toContain('/skyways_all_all/');
  });

  it('puts each month in the three months around its season', () => {
    expect([12, 1, 2].map(kk7SeasonOf)).toEqual(['jan', 'jan', 'jan']);
    expect([3, 4, 5].map(kk7SeasonOf)).toEqual(['apr', 'apr', 'apr']);
    expect([6, 7, 8].map(kk7SeasonOf)).toEqual(['jul', 'jul', 'jul']);
    expect([9, 10, 11].map(kk7SeasonOf)).toEqual(['oct', 'oct', 'oct']);
  });
});

describe('rain now', () => {
  it('uses the newest radar picture', () => {
    const rain = newestRain({
      host: 'https://tiles.example',
      radar: {
        past: [
          { time: 1000, path: '/v2/radar/old' },
          { time: 1600, path: '/v2/radar/new' },
        ],
      },
    });
    expect(rain).toEqual({
      url: 'https://tiles.example/v2/radar/new/256/{z}/{x}/{y}/2/1_0.png',
      at: 1_600_000,
    });
  });

  it('gives nothing without pictures', () => {
    expect(newestRain({ host: 'https://tiles.example', radar: { past: [] } })).toBeNull();
    expect(newestRain({})).toBeNull();
  });
});

describe('clouds now', () => {
  it('picks the satellite that sees the place best', () => {
    expect(cloudSatelliteAt(-122).id).toBe('goes-west'); // Washington
    expect(cloudSatelliteAt(-76.3).id).toBe('goes-east'); // Colombia
    expect(cloudSatelliteAt(6.9).id).toBe('meteosat'); // the Alps
    expect(cloudSatelliteAt(76.7).id).toBe('meteosat-indian-ocean'); // Bir, India
    expect(cloudSatelliteAt(138).id).toBe('himawari'); // Japan
    expect(cloudSatelliteAt(180).id).toBe('goes-west');
    expect(cloudSatelliteAt(200).id).toBe('goes-west');
  });

  it('folds longitudes into -180 to 180', () => {
    expect(wrapLongitude(190)).toBe(-170);
    expect(wrapLongitude(-190)).toBe(170);
    expect(wrapLongitude(45)).toBe(45);
  });

  it('knows day from night by the sun', () => {
    // Noon and midnight in the Alps in June
    expect(sunElevation(46, 7, Date.parse('2026-06-21T11:30:00Z'))).toBeGreaterThan(60);
    expect(sunElevation(46, 7, Date.parse('2026-06-21T23:30:00Z'))).toBeLessThan(-10);
    // Seattle at 09:00 local on a winter day is just after sunrise
    const seattle = sunElevation(47.6, -122.3, Date.parse('2026-12-21T17:00:00Z'));
    expect(seattle).toBeGreaterThan(0);
    expect(seattle).toBeLessThan(10);
  });

  it('shows visible light by day and infrared at night', () => {
    const day = cloudImageryAt(4.4, -76.3, Date.parse('2026-01-15T17:00:00Z'));
    expect(day.visible).toBe(true);
    expect(day.imagery).toMatchObject({
      kind: 'gibs',
      layer: 'GOES-East_ABI_Band2_Red_Visible_1km',
    });
    const night = cloudImageryAt(46, 7, Date.parse('2026-01-15T23:00:00Z'));
    expect(night.visible).toBe(false);
    expect(night.imagery).toMatchObject({ kind: 'wms', workspace: 'mtg_fd', layer: 'ir105_hrfi' });
  });

  it('builds GIBS tile URLs with rows before columns', () => {
    const imagery = cloudSatelliteAt(-122).day;
    if (imagery.kind !== 'gibs') throw new Error('expected GIBS');
    expect(gibsTileUrl(imagery, '2026-10-22T17:30:00Z')).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-West_ABI_Band2_Red_Visible_1km/default/2026-10-22T17:30:00Z/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
    );
  });
});

describe('lightning now', () => {
  it('covers the Americas from the ground networks and Europe and Africa from Meteosat', () => {
    expect(lightningSourcesAt(47.5, -122).map((s) => s.id)).toEqual(['noaa']);
    expect(lightningSourcesAt(4.4, -76.3).map((s) => s.id)).toEqual(['noaa']);
    expect(lightningSourcesAt(46, 7).map((s) => s.id)).toEqual(['meteosat']);
    expect(lightningSourcesAt(-15, -47).map((s) => s.id)).toEqual(['noaa', 'meteosat']);
    expect(lightningSourcesAt(35.6, 139.7).map((s) => s.id)).toEqual(['noaa']);
    expect(lightningSourcesAt(32, 76.7)).toEqual([]); // northern India
    expect(lightningSourcesAt(-33.9, 151.2)).toEqual([]); // Sydney
  });
});

describe('picture times', () => {
  it('reads the newest time from a layer capabilities answer', () => {
    expect(
      newestWmsTime('<Dimension name="time" default="2026-10-22T18:15:00Z" units="ISO8601">'),
    ).toBe(Date.parse('2026-10-22T18:15:00Z'));
    expect(newestWmsTime('<WMS_Capabilities/>')).toBeNull();
  });

  it('asks a GeoServer for one layer only', () => {
    expect(layerCapabilitiesUrl('https://view.eumetsat.int/geoserver', 'mtg_fd', 'li_afa')).toBe(
      'https://view.eumetsat.int/geoserver/mtg_fd/li_afa/ows?service=WMS&version=1.3.0&request=GetCapabilities',
    );
  });

  it('says how old a picture is', () => {
    const now = Date.parse('2026-10-22T18:30:00Z');
    expect(ageText(now - 20_000, now)).toBe('just now');
    expect(ageText(now - 12 * 60_000, now)).toBe('12 min ago');
    expect(ageText(now - 60 * 60_000, now)).toBe('1 h ago');
    expect(ageText(now - 65 * 60_000, now)).toBe('1 h 5 min ago');
  });
});

describe('airspace', () => {
  it('asks openAIP for its own tile', () => {
    expect(openAipTileUrl(8, 41, 89)).toBe(
      'https://api.tiles.openaip.net/api/data/openaip/8/41/89.png',
    );
  });
});
