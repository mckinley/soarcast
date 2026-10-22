import { describe, expect, it } from 'vitest';
import { launchSiteValuesFromPgSite } from '../launch-sites';
import type { PgSite } from '../pgsites-client';

const pgSite: PgSite = {
  id: '0b0c4c38-6a8a-4a5e-9d55-2f4f6f2d7c11',
  pge_site_id: -3,
  name: 'Launch near Pemberton',
  country_code: 'CA',
  latitude: 50.35,
  longitude: -122.79,
  altitude: 1100,
  landing_altitude: null,
  landing_latitude: null,
  landing_longitude: null,
  wind_n: 0,
  wind_ne: 0,
  wind_e: 0,
  wind_se: 2,
  wind_s: 1,
  wind_sw: 0,
  wind_w: 0,
  wind_nw: 0,
  is_paragliding: 1,
  is_hanggliding: 0,
  description: '',
  pge_link: '',
  created_at: 0,
  updated_at: 0,
};

describe('launchSiteValuesFromPgSite', () => {
  it('keeps where pgsites got the site', () => {
    expect(launchSiteValuesFromPgSite({ ...pgSite, source: 'flown' }).origin).toBe('flown');
    expect(launchSiteValuesFromPgSite({ ...pgSite, source: 'pge' }).origin).toBe('pge');
    // pgsites answers from before it said where a site came from
    expect(launchSiteValuesFromPgSite(pgSite).origin).toBe('pge');
  });
});
