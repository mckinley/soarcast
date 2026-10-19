import { useLoaderData } from 'react-router';
import type { Route } from './+types/_auth.dashboard';
import { getDb } from '~/app/lib/db.server';
import { requireAuth } from '~/app/lib/auth.server';
import { DashboardClient, type SuggestedSite } from '@/components/dashboard-client';
import { userFavoriteSites, customSites, launchSites, settings } from '~/db/schema';
import { eq, asc } from 'drizzle-orm';
import { nearbySites, getPgsitesApiKey, pgsitesSlug } from '~/lib/pgsites-client';
import { evaluateDays, launchProfileFromSite } from '~/lib/forecast-engine';
import { getAtmosphericProfile, profileToday, setProfileDb } from '~/lib/weather-profile';
import { mapWithConcurrency } from '~/lib/utils';
import type { Site, DayScore } from '~/types';
import { customSiteToSite } from '~/lib/custom-sites';
import { launchSiteToSite } from '~/lib/launch-sites';
import { refreshLaunchSites } from '~/app/lib/launch-sites.server';

export interface SiteForecastData {
  site: Site;
  scores: DayScore[];
  /** Today's date where the site is (YYYY-MM-DD) */
  today: string;
  siteType: 'launch' | 'custom';
  slug?: string;
  error?: string;
}

/** Forecasts fetched at once: Open-Meteo rate-limits bursts. */
const FORECAST_CONCURRENCY = 4;

export function meta() {
  return [{ title: 'Dashboard | SoarCast' }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const db = getDb(env);
  const userId = session.user.id;

  setProfileDb(db);

  // Fetch favorites, custom sites and settings in parallel
  const [favorites, customs, [userSettings]] = await Promise.all([
    db
      .select({ favorite: userFavoriteSites, site: launchSites })
      .from(userFavoriteSites)
      .innerJoin(launchSites, eq(launchSites.id, userFavoriteSites.siteId))
      .where(eq(userFavoriteSites.userId, userId))
      .orderBy(asc(launchSites.name)),
    db
      .select()
      .from(customSites)
      .where(eq(customSites.userId, userId))
      .orderBy(asc(customSites.name)),
    db.select().from(settings).where(eq(settings.userId, userId)).limit(1),
  ]);

  // Convert to Site format and build metadata
  const siteMetadata = new Map<string, { siteType: 'launch' | 'custom'; slug?: string }>();

  // Followed sites' copies pick up pgsites changes, like what a site gives
  const refreshedSites = await refreshLaunchSites(
    db,
    getPgsitesApiKey(env),
    favorites.map((f) => f.site),
  );
  const favoritesAsSites: Site[] = favorites.map((f, i) => {
    siteMetadata.set(f.site.id, { siteType: 'launch', slug: f.site.slug });
    return launchSiteToSite(refreshedSites[i], f.favorite);
  });

  const customSitesAsSites: Site[] = customs.map((site) => {
    siteMetadata.set(site.id, { siteType: 'custom' });
    return customSiteToSite(site);
  });

  const allSites = [...customSitesAsSites, ...favoritesAsSites];

  // Day verdicts for every site, a few at a time
  const data: SiteForecastData[] = await mapWithConcurrency(
    allSites,
    FORECAST_CONCURRENCY,
    async (site) => {
      const meta = siteMetadata.get(site.id)!;
      try {
        const { profile } = await getAtmosphericProfile(site.latitude, site.longitude, 7);
        return {
          site,
          scores: evaluateDays(profile, launchProfileFromSite(site)),
          today: profileToday(profile),
          siteType: meta.siteType,
          slug: meta.slug,
        };
      } catch (error) {
        console.error(`Forecast for ${site.name} failed:`, error);
        return {
          site,
          scores: [],
          today: new Date().toISOString().slice(0, 10),
          siteType: meta.siteType,
          slug: meta.slug,
          error: 'The forecast service is busy. Reload in a minute.',
        };
      }
    },
  );

  // A pilot with no sites yet gets launches to start from on the empty dashboard
  let suggestions: SuggestedSite[] = [];
  if (allSites.length === 0) {
    try {
      // SoarCast's pilots are around Seattle so far: suggest launches within 150 km
      const sites = await nearbySites(getPgsitesApiKey(env), 47.5, -121.8, 150, 3);
      suggestions = sites.map((s) => ({
        id: s.id,
        name: s.name,
        slug: pgsitesSlug(s.name, s.id),
        elevation: s.altitude,
      }));
    } catch (error) {
      console.error('Launch suggestions failed:', error);
    }
  }

  const appSettings = userSettings
    ? {
        notifications: {
          enabled: false,
          daysAhead: userSettings.daysAhead,
          sitePreferences: {} as Record<string, boolean>,
        },
        emailDigest: {
          enabled: userSettings.morningDigestEnabled,
          digestTime: userSettings.morningDigestTime ?? '08:00',
        },
        updatedAt: userSettings.updatedAt.toISOString(),
      }
    : null;

  return {
    user: session.user,
    data,
    settings: appSettings,
    suggestions,
  };
}

export default function DashboardPage() {
  const { data, settings: appSettings, suggestions } = useLoaderData<typeof loader>();

  const defaultSettings = {
    notifications: {
      enabled: false,
      daysAhead: 2,
      sitePreferences: {} as Record<string, boolean>,
    },
    emailDigest: { enabled: false, digestTime: '08:00' },
    updatedAt: new Date().toISOString(),
  };

  return (
    <DashboardClient
      data={data}
      settings={appSettings ?? defaultSettings}
      isAuthenticated={true}
      suggestions={suggestions}
    />
  );
}
