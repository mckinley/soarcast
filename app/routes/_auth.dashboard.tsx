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
import { fillCustomTerrain } from '~/app/lib/custom-sites.server';
import { compsWorldwide } from '~/app/lib/comps.server';
import { addDays } from '~/lib/alert-schedule';
import { compsAround, type Comp } from '~/lib/comps';
import { AREA_JOIN_KM, nearestArea } from '~/lib/site-areas';
import { requestPlace, savedSiteKey, syncAreas, type SavedSite } from '~/app/lib/site-areas.server';
import { launchSiteSlug } from '~/lib/site-address';

export interface SiteForecastData {
  site: Site;
  scores: DayScore[];
  /** Today's date where the site is (YYYY-MM-DD) */
  today: string;
  siteType: 'launch' | 'custom';
  slug?: string;
  error?: string;
  /** Comps held at the site this week */
  comps: Comp[];
  /** The area the site is in */
  areaId: string | null;
}

/** An area Forecast can show: chips at the top switch between them. */
export interface DashboardArea {
  id: string;
  name: string;
  siteCount: number;
}

/**
 * What the dashboard shows: one area, every area side by side ("all"), or
 * every site when there's only one area. `chosenBy` says why that area.
 */
export interface ShownArea {
  area: string | 'all' | null;
  chosenBy: 'link' | 'location' | 'size';
}

/** Listed launches near the pilot, when no saved site is. */
export interface NearYou {
  city: string | null;
  sites: SuggestedSite[];
}

/** Forecasts fetched at once: Open-Meteo rate-limits bursts. */
const FORECAST_CONCURRENCY = 4;

export function meta() {
  return [{ title: 'Forecast | SoarCast' }];
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

  // Big mountains are rated with wider margins only when the pilot keeps them
  const margins = userSettings?.mountainMargins ?? false;

  // Every saved site sits in an area; new ones join one by distance
  const saved: SavedSite[] = [
    ...favorites.map((f) => ({
      key: savedSiteKey('launch', f.site.id),
      name: f.site.name,
      latitude: f.site.latitude,
      longitude: f.site.longitude,
      areaId: f.favorite.areaId,
      savedAt: f.favorite.createdAt,
    })),
    ...customs.map((c) => ({
      key: savedSiteKey('custom', c.id),
      name: c.name,
      latitude: parseFloat(c.latitude),
      longitude: parseFloat(c.longitude),
      areaId: c.areaId,
      savedAt: c.createdAt,
    })),
  ];
  const { areas, areaOf } = await syncAreas(db, userId, saved);
  const here = requestPlace(context.cloudflare.cf);

  // One area at a time: the one asked for, else the one nearest the pilot
  const url = new URL(request.url);
  const asked = url.searchParams.get('area');
  const placeOf = new Map(saved.map((s) => [s.key, s]));
  const placed = areas.map((a) => ({ ...a, sites: a.siteKeys.map((k) => placeOf.get(k)!) }));
  const nearest = here ? nearestArea(placed, here) : null;
  const shown: ShownArea =
    areas.length < 2
      ? { area: null, chosenBy: 'size' }
      : asked === 'all' || areas.some((a) => a.id === asked)
        ? { area: asked!, chosenBy: 'link' }
        : nearest
          ? { area: nearest.area.id, chosenBy: 'location' }
          : {
              area: [...areas].sort((a, b) => b.siteKeys.length - a.siteKeys.length)[0].id,
              chosenBy: 'size',
            };
  const shownKeys =
    shown.area && shown.area !== 'all'
      ? new Set(areas.find((a) => a.id === shown.area)!.siteKeys)
      : null;
  const isShown = (key: string) => !shownKeys || shownKeys.has(key);

  // Convert to Site format and build metadata
  const siteMetadata = new Map<
    string,
    { siteType: 'launch' | 'custom'; slug?: string; areaId: string | null }
  >();

  // Followed sites' copies pick up pgsites changes, like what a site gives
  const shownFavorites = favorites.filter((f) => isShown(savedSiteKey('launch', f.site.id)));
  const refreshedSites = await refreshLaunchSites(
    db,
    getPgsitesApiKey(env),
    shownFavorites.map((f) => f.site),
  );
  const favoritesAsSites: Site[] = shownFavorites.map((f, i) => {
    siteMetadata.set(f.site.id, {
      siteType: 'launch',
      slug: launchSiteSlug(f.site),
      areaId: areaOf.get(savedSiteKey('launch', f.site.id)) ?? null,
    });
    return launchSiteToSite(refreshedSites[i], f.favorite, margins);
  });

  const shownCustoms = customs.filter((c) => isShown(savedSiteKey('custom', c.id)));
  // Private sites saved before their terrain was measured get it now
  await fillCustomTerrain(db, shownCustoms);
  const customSitesAsSites: Site[] = shownCustoms.map((site) => {
    siteMetadata.set(site.id, {
      siteType: 'custom',
      areaId: areaOf.get(savedSiteKey('custom', site.id)) ?? null,
    });
    return customSiteToSite(site, margins);
  });

  const allSites = [...customSitesAsSites, ...favoritesAsSites];

  // This week's comps anywhere, fetched while the forecasts load; each site keeps its own
  const utcToday = new Date().toISOString().slice(0, 10);
  const weekComps =
    allSites.length > 0
      ? compsWorldwide(env, { from: addDays(utcToday, -1), to: addDays(utcToday, 8) })
      : Promise.resolve(null);

  // Day verdicts for every site, a few at a time
  const forecasts = await mapWithConcurrency(
    allSites,
    FORECAST_CONCURRENCY,
    async (site): Promise<Omit<SiteForecastData, 'comps'>> => {
      const meta = siteMetadata.get(site.id)!;
      try {
        const { profile } = await getAtmosphericProfile(site.latitude, site.longitude, 7);
        return {
          site,
          scores: evaluateDays(profile, launchProfileFromSite(site)),
          today: profileToday(profile),
          siteType: meta.siteType,
          slug: meta.slug,
          areaId: meta.areaId,
        };
      } catch (error) {
        console.error(`Forecast for ${site.name} failed:`, error);
        return {
          site,
          scores: [],
          today: new Date().toISOString().slice(0, 10),
          siteType: meta.siteType,
          slug: meta.slug,
          areaId: meta.areaId,
          error: 'The forecast service is busy. Reload in a minute.',
        };
      }
    },
  );
  const comps = (await weekComps) ?? [];
  const data: SiteForecastData[] = forecasts.map((f) => ({
    ...f,
    comps: compsAround(comps, f.site.latitude, f.site.longitude),
  }));

  // Listed launches near the pilot: to start from on the empty dashboard, or
  // where they are when no saved site is near
  const toSuggested = (sites: Awaited<ReturnType<typeof nearbySites>>): SuggestedSite[] =>
    sites.map((s) => ({
      id: s.id,
      name: s.name,
      slug: pgsitesSlug(s.name, s.id),
      elevation: s.altitude,
    }));
  let suggestions: SuggestedSite[] = [];
  let nearYou: NearYou | null = null;
  if (saved.length === 0) {
    try {
      // Near the pilot when the connection says where; else around Seattle,
      // where SoarCast's pilots are so far
      const at = here ?? { latitude: 47.5, longitude: -121.8 };
      suggestions = toSuggested(
        await nearbySites(getPgsitesApiKey(env), at.latitude, at.longitude, 150, 3),
      );
    } catch (error) {
      console.error('Launch suggestions failed:', error);
    }
  } else if (here && nearest && nearest.km > AREA_JOIN_KM) {
    try {
      const sites = await nearbySites(getPgsitesApiKey(env), here.latitude, here.longitude, 100, 3);
      if (sites.length > 0) nearYou = { city: here.city, sites: toSuggested(sites) };
    } catch (error) {
      console.error('Launches near the pilot failed:', error);
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
        experiments: userSettings.showExperiments,
        mountainMargins: userSettings.mountainMargins,
        updatedAt: userSettings.updatedAt.toISOString(),
      }
    : null;

  return {
    user: session.user,
    data,
    settings: appSettings,
    suggestions,
    suggestionsNearYou: saved.length === 0 && here !== null,
    areas: areas.map((a) => ({ id: a.id, name: a.name, siteCount: a.siteKeys.length })),
    shown,
    nearYou,
  };
}

export default function DashboardPage() {
  const {
    data,
    settings: appSettings,
    suggestions,
    suggestionsNearYou,
    areas,
    shown,
    nearYou,
  } = useLoaderData<typeof loader>();

  const defaultSettings = {
    notifications: {
      enabled: false,
      daysAhead: 2,
      sitePreferences: {} as Record<string, boolean>,
    },
    emailDigest: { enabled: false, digestTime: '08:00' },
    experiments: false,
    mountainMargins: false,
    updatedAt: new Date().toISOString(),
  };

  return (
    <DashboardClient
      data={data}
      settings={appSettings ?? defaultSettings}
      isAuthenticated={true}
      suggestions={suggestions}
      suggestionsNearYou={suggestionsNearYou}
      areas={areas}
      shown={shown}
      nearYou={nearYou}
    />
  );
}
