import { useLoaderData } from 'react-router';
import type { Route } from './+types/_auth.dashboard';
import { getDb } from '~/app/lib/db.server';
import { requireAuth } from '~/app/lib/auth.server';
import { DashboardClient } from '@/components/dashboard-client';
import { OnboardingFlow } from '@/components/onboarding-flow';
import { userFavoriteSites, customSites, launchSites, settings } from '~/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getSitesByCountry, getPgsitesApiKey } from '~/lib/pgsites-client';
import { getForecast, fetchAllForecasts, setWeatherDb } from '~/lib/weather';
import { calculateDailyScores, calculateDailyScoresFromProfile } from '~/lib/scoring';
import { getAtmosphericProfile, setProfileDb } from '~/lib/weather-profile';
import type { Site, Forecast, DayScore } from '~/types';
import { getIdealWindDirections } from '~/lib/site-utils';
// import { DashboardClient } from '~/components/dashboard-client'
// import { OnboardingFlow } from '~/components/onboarding-flow'

export interface SiteForecastData {
  site: Site;
  forecast: Forecast | null;
  scores: DayScore[];
  siteType: 'launch' | 'custom';
  slug?: string;
  error?: string;
}

export function meta() {
  return [{ title: 'Dashboard | SoarCast' }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const db = getDb(env);
  const userId = session.user.id;

  // Initialize weather/profile DBs for this request
  setWeatherDb(db);
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
      maxWindSpeed: f.favorite.customMaxWind || f.site.maxWindSpeed || 40,
      notes: f.favorite.notes ?? undefined,
      createdAt: new Date(f.site.createdAt).toISOString(),
      updatedAt: new Date(f.site.updatedAt).toISOString(),
    };
  });

  const customSitesAsSites: Site[] = customs.map((site) => {
    siteMetadata.set(site.id, { siteType: 'custom' });
    return {
      id: site.id,
      name: site.name,
      latitude: parseFloat(site.latitude),
      longitude: parseFloat(site.longitude),
      elevation: site.elevation,
      idealWindDirections: site.idealWindDirections,
      maxWindSpeed: site.maxWindSpeed,
      notes: undefined,
      createdAt: new Date(site.createdAt).toISOString(),
      updatedAt: new Date(site.updatedAt).toISOString(),
    };
  });

  const allSites = [...customSitesAsSites, ...favoritesAsSites];

  // Fetch forecasts and scores for all sites
  const data: SiteForecastData[] = await Promise.all(
    allSites.map(async (site) => {
      const meta = siteMetadata.get(site.id)!;
      try {
        const forecastResult = await getForecast(
          site.id,
          site.latitude,
          site.longitude,
          meta.siteType,
        );

        let scores: DayScore[];
        try {
          const profileResult = await getAtmosphericProfile(site.latitude, site.longitude, 7);
          scores = calculateDailyScoresFromProfile(
            profileResult.profile,
            forecastResult.forecast,
            site,
          );
        } catch {
          scores = calculateDailyScores(forecastResult.forecast, site);
        }

        return {
          site,
          forecast: forecastResult.forecast,
          scores,
          siteType: meta.siteType,
          slug: meta.slug,
        };
      } catch (error) {
        return {
          site,
          forecast: null,
          scores: [],
          siteType: meta.siteType,
          slug: meta.slug,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),
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
      const result = await getSitesByCountry(apiKey, 'US', 5);
      popularSites = result.sites.map((s) => {
        const nameSlug = s.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        return {
          id: s.id,
          name: s.name,
          slug: `${nameSlug}-${s.id.slice(0, 8)}`,
          region: null,
          elevation: s.altitude,
        };
      });
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

  setWeatherDb(db);

  switch (intent) {
    case 'refreshForecasts': {
      try {
        const [userCustomSites, favorites] = await Promise.all([
          db.query.customSites.findMany({ where: eq(customSites.userId, userId) }),
          db
            .select({ favorite: userFavoriteSites, site: launchSites })
            .from(userFavoriteSites)
            .innerJoin(launchSites, eq(launchSites.id, userFavoriteSites.siteId))
            .where(eq(userFavoriteSites.userId, userId)),
        ]);

        const allSites = [
          ...userCustomSites.map((s) => ({
            id: s.id,
            latitude: parseFloat(s.latitude),
            longitude: parseFloat(s.longitude),
            siteType: 'custom' as const,
          })),
          ...favorites.map((f) => ({
            id: f.site.id,
            latitude: f.site.latitude,
            longitude: f.site.longitude,
            siteType: 'launch' as const,
          })),
        ];

        if (allSites.length === 0) {
          return { success: false, message: 'No sites configured' };
        }

        await fetchAllForecasts(allSites);
        return { success: true, message: `Refreshed forecasts for ${allSites.length} site(s)` };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to refresh forecasts',
        };
      }
    }

    case 'completeOnboarding': {
      await db
        .update(settings)
        .set({ onboardingCompleted: true, updatedAt: new Date() })
        .where(eq(settings.userId, userId));
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
