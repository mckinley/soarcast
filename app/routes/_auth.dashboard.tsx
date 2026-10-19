import { useLoaderData } from 'react-router';
import type { Route } from './+types/_auth.dashboard';
import { getDb } from '~/app/lib/db.server';
import { requireAuth } from '~/app/lib/auth.server';
import { DashboardClient } from '@/components/dashboard-client';
import { OnboardingFlow } from '@/components/onboarding-flow';
import { userFavoriteSites, customSites, launchSites, settings } from '~/db/schema';
import { eq, asc } from 'drizzle-orm';
import { nearbySites, getPgsitesApiKey, pgsitesSlug } from '~/lib/pgsites-client';
import { evaluateDays, launchProfileFromSite, DEFAULT_MAX_WIND_KMH } from '~/lib/forecast-engine';
import { getAtmosphericProfile, profileToday, setProfileDb } from '~/lib/weather-profile';
import { mapWithConcurrency } from '~/lib/utils';
import type { Site, DayScore } from '~/types';
import { getIdealWindDirections, getOkWindDirections } from '~/lib/site-utils';
import { customSiteToSite } from '~/lib/custom-sites';

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

  // Fetch favorites, custom sites, settings, and onboarding status in parallel
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

  const onboardingCompleted = userSettings?.onboardingCompleted ?? false;

  // Convert to Site format and build metadata
  const siteMetadata = new Map<string, { siteType: 'launch' | 'custom'; slug?: string }>();

  const favoritesAsSites: Site[] = favorites.map((f) => {
    siteMetadata.set(f.site.id, { siteType: 'launch', slug: f.site.slug });
    return {
      id: f.site.id,
      name: f.site.name,
      latitude: f.site.latitude,
      longitude: f.site.longitude,
      elevation: f.site.altitude || 0,
      idealWindDirections: f.favorite.customIdealDirections || getIdealWindDirections(f.site),
      okWindDirections: f.favorite.customIdealDirections ? [] : getOkWindDirections(f.site),
      maxWindSpeed: f.favorite.customMaxWind || f.site.maxWindSpeed || DEFAULT_MAX_WIND_KMH,
      notes: f.favorite.notes ?? undefined,
      createdAt: new Date(f.site.createdAt).toISOString(),
      updatedAt: new Date(f.site.updatedAt).toISOString(),
    };
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

  // Get popular sites for onboarding from pgsites API
  let popularSites: Array<{
    id: string;
    name: string;
    slug: string;
    region: string | null;
    elevation: number | null;
  }> = [];
  if (!onboardingCompleted) {
    try {
      const apiKey = getPgsitesApiKey(env);
      // SoarCast's pilots are around Seattle so far: suggest launches within 150 km
      const sites = await nearbySites(apiKey, 47.5, -121.8, 150, 5);
      popularSites = sites.map((s) => ({
        id: s.id,
        name: s.name,
        slug: pgsitesSlug(s.name, s.id),
        region: null,
        elevation: s.altitude,
      }));
    } catch {
      // Fallback to local DB if API fails
      popularSites = await db
        .select({
          id: launchSites.id,
          name: launchSites.name,
          slug: launchSites.slug,
          region: launchSites.region,
          elevation: launchSites.altitude,
        })
        .from(launchSites)
        .orderBy(asc(launchSites.name))
        .limit(5);
    }
  }

  const appSettings = userSettings
    ? {
        notifications: {
          enabled: false,
          minScoreThreshold: userSettings.minScoreThreshold,
          daysAhead: userSettings.daysAhead,
          sitePreferences: {} as Record<string, boolean>,
          siteMinRatings: {} as Record<string, 'Good' | 'Great' | 'Epic' | undefined>,
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
    onboardingCompleted,
    popularSites,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const db = getDb(env);
  const userId = session.user.id;
  const formData = await request.formData();
  const intent = formData.get('intent');

  switch (intent) {
    case 'completeOnboarding': {
      // Pilots who signed up before settings rows were created at sign-up have none
      await db
        .insert(settings)
        .values({ userId, onboardingCompleted: true })
        .onConflictDoUpdate({
          target: settings.userId,
          set: { onboardingCompleted: true, updatedAt: new Date() },
        });
      return { success: true };
    }

    default:
      return { error: 'Unknown action' };
  }
}

export default function DashboardPage() {
  const {
    data,
    settings: appSettings,
    onboardingCompleted,
    popularSites,
  } = useLoaderData<typeof loader>();

  const defaultSettings = {
    notifications: {
      enabled: false,
      minScoreThreshold: 70,
      daysAhead: 2,
      sitePreferences: {} as Record<string, boolean>,
      siteMinRatings: {} as Record<string, 'Good' | 'Great' | 'Epic' | undefined>,
    },
    emailDigest: { enabled: false, digestTime: '08:00' },
    updatedAt: new Date().toISOString(),
  };

  return (
    <>
      {!onboardingCompleted && <OnboardingFlow popularSites={popularSites} />}
      <DashboardClient
        data={data}
        settings={appSettings ?? defaultSettings}
        isAuthenticated={true}
      />
    </>
  );
}
