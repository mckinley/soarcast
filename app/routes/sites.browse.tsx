import { useLoaderData } from 'react-router';
import type { Route } from './+types/sites.browse';
import { getDb } from '~/app/lib/db.server';
import { getSession } from '~/app/lib/auth.server';
import { launchSites, userFavoriteSites, forecastsCache } from '~/db/schema';
import { eq, and, like, or, inArray } from 'drizzle-orm';
import { calculateDailyScores } from '~/lib/scoring';
import type { Forecast } from '~/types';
import { SitesBrowseClient } from '@/components/sites-browse-client';

export function meta() {
  return [
    { title: 'Browse Launch Sites | SoarCast' },
    { name: 'description', content: 'Browse paragliding and hang gliding launch sites.' },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const db = getDb(env);
  const url = new URL(request.url);

  const search = url.searchParams.get('search') || '';
  const region = url.searchParams.get('region') || '';
  const country = url.searchParams.get('country') || '';
  const siteType = url.searchParams.get('siteType') || '';

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(launchSites.name, `%${search}%`),
        like(launchSites.region, `%${search}%`),
        like(launchSites.countryCode, `%${search}%`),
      ),
    );
  }
  if (region) conditions.push(eq(launchSites.region, region));
  if (country) conditions.push(eq(launchSites.countryCode, country));
  if (siteType) conditions.push(eq(launchSites.siteType, siteType));

  const sites = await db.query.launchSites.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: (launchSites, { asc }) => [asc(launchSites.name)],
  });

  // Get filter options
  const allSites = conditions.length > 0 ? await db.query.launchSites.findMany() : sites;
  const filterOptions = {
    regions: [...new Set(allSites.map((s) => s.region).filter(Boolean))] as string[],
    countries: [...new Set(allSites.map((s) => s.countryCode).filter(Boolean))] as string[],
    siteTypes: [...new Set(allSites.map((s) => s.siteType).filter(Boolean))] as string[],
  };

  // Get today's scores from cache
  const today = new Date().toISOString().split('T')[0];
  const siteIds = sites.map((s) => s.id);
  const scores: Record<string, number | null> = {};

  if (siteIds.length > 0) {
    const cached = await db
      .select({ siteId: forecastsCache.siteId, data: forecastsCache.data })
      .from(forecastsCache)
      .where(
        and(
          inArray(forecastsCache.siteId, siteIds),
          eq(forecastsCache.siteType, 'launch'),
          eq(forecastsCache.fetchDate, today),
        ),
      );

    const forecastMap = new Map<string, Forecast>();
    for (const row of cached) forecastMap.set(row.siteId, row.data as Forecast);

    for (const site of sites) {
      const forecast = forecastMap.get(site.id);
      if (!forecast) {
        scores[site.id] = null;
        continue;
      }
      const dayScores = calculateDailyScores(forecast, {
        id: site.id,
        name: site.name,
        latitude: parseFloat(site.latitude),
        longitude: parseFloat(site.longitude),
        elevation: site.elevation || 0,
        idealWindDirections: site.idealWindDirections || [],
        maxWindSpeed: site.maxWindSpeed || 40,
        createdAt: site.createdAt?.toISOString() || '',
        updatedAt: site.updatedAt?.toISOString() || '',
      });
      scores[site.id] = dayScores.length > 0 ? dayScores[0].overallScore : null;
    }
  }

  // Check user favorites
  const session = await getSession(request, env);
  const userFavoriteIds: string[] = [];
  if (session?.user?.id) {
    const favs = await db
      .select({ siteId: userFavoriteSites.siteId })
      .from(userFavoriteSites)
      .where(eq(userFavoriteSites.userId, session.user.id));
    favs.forEach((f) => userFavoriteIds.push(f.siteId));
  }

  return {
    sites,
    filterOptions,
    scores,
    userFavoriteIds,
    searchParams: { search, region, country, siteType },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb(env);
  const formData = await request.formData();
  const intent = formData.get('intent');
  const siteId = formData.get('siteId') as string;

  switch (intent) {
    case 'favorite': {
      await db.insert(userFavoriteSites).values({
        userId: session.user.id,
        siteId,
        notify: false,
      });
      return { success: true };
    }
    case 'unfavorite': {
      await db
        .delete(userFavoriteSites)
        .where(
          and(eq(userFavoriteSites.userId, session.user.id), eq(userFavoriteSites.siteId, siteId)),
        );
      return { success: true };
    }
    default:
      return { error: 'Unknown action' };
  }
}

export default function BrowseSitesPage() {
  const { sites, filterOptions, scores, userFavoriteIds, searchParams } =
    useLoaderData<typeof loader>();

  return (
    <SitesBrowseClient
      initialSites={sites}
      filterOptions={filterOptions}
      searchParams={searchParams}
      siteScores={scores}
      initialFavoriteIds={userFavoriteIds}
    />
  );
}
