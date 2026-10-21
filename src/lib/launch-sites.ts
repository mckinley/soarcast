// Listed launches (copied from pgsites into launch_sites when a pilot
// follows one) as the Site the engine rates, with the pilot's own wind
// limit, directions, site kind and goal on top.

import type { LaunchSite, NewLaunchSite, UserFavoriteSite } from '@/db/schema';
import type { Site, SiteKind } from '@/types';
import type { PgSite } from '@/lib/pgsites-client';
import { pgsitesSlug } from '@/lib/pgsites-client';
import { DEFAULT_MAX_WIND_KMH } from '@/lib/forecast-engine';
import { getIdealWindDirections, getOkWindDirections } from '@/lib/site-utils';
import { defaultGoal, siteKindFromTags } from '@/lib/site-goals';

/** A followed site's copy is refreshed from pgsites once it is this many days old. */
export const SITE_REFRESH_DAYS = 7;

/** The site's kind from its Paragliding Earth tags; null when it has none. */
export function launchSiteKind(row: Pick<LaunchSite, 'isThermal' | 'isSoaring' | 'isXc'>) {
  return siteKindFromTags({ thermal: row.isThermal, soaring: row.isSoaring, xc: row.isXc });
}

export function launchSiteToSite(
  row: LaunchSite,
  favorite?: Pick<
    UserFavoriteSite,
    'customMaxWind' | 'customIdealDirections' | 'notes' | 'siteKind' | 'goal'
  > | null,
): Site {
  const kind: SiteKind | null = favorite?.siteKind ?? launchSiteKind(row);
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    elevation: row.altitude || 0,
    idealWindDirections: favorite?.customIdealDirections || getIdealWindDirections(row),
    okWindDirections: favorite?.customIdealDirections ? [] : getOkWindDirections(row),
    maxWindSpeed: favorite?.customMaxWind || row.maxWindSpeed || DEFAULT_MAX_WIND_KMH,
    kind,
    goal: favorite?.goal ?? defaultGoal(kind, row.isHike),
    notes: favorite?.notes ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

/** launch_sites columns from a pgsites site, for inserting or refreshing the copy. */
export function launchSiteValuesFromPgSite(
  pgSite: PgSite,
): Omit<NewLaunchSite, 'id' | 'source' | 'pgsitesId'> {
  return {
    name: pgSite.name,
    slug: pgsitesSlug(pgSite.name, pgSite.id),
    countryCode: pgSite.country_code,
    latitude: pgSite.latitude,
    longitude: pgSite.longitude,
    altitude: pgSite.altitude,
    landingAltitude: pgSite.landing_altitude,
    landingLatitude: pgSite.landing_latitude,
    landingLongitude: pgSite.landing_longitude,
    windN: pgSite.wind_n,
    windNe: pgSite.wind_ne,
    windE: pgSite.wind_e,
    windSe: pgSite.wind_se,
    windS: pgSite.wind_s,
    windSw: pgSite.wind_sw,
    windW: pgSite.wind_w,
    windNw: pgSite.wind_nw,
    isParagliding: !!pgSite.is_paragliding,
    isHanggliding: !!pgSite.is_hanggliding,
    isThermal: !!pgSite.is_thermal,
    isSoaring: !!pgSite.is_soaring,
    isXc: !!pgSite.is_xc,
    isHike: !!pgSite.is_hike,
    description: pgSite.description,
    pgeLink: pgSite.pge_link,
    lastSyncedAt: new Date(),
  };
}
