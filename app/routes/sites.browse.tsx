import { useLoaderData } from 'react-router';
import type { Route } from './+types/sites.browse';
import { getDb } from '~/app/lib/db.server';
import { getSession } from '~/app/lib/auth.server';
import { launchSites, userFavoriteSites, forecastsCache } from '~/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { calculateDailyScores } from '~/lib/scoring';
import type { Forecast } from '~/types';
import { SitesBrowseClient, type BrowseSite } from '@/components/sites-browse-client';
import { getIdealWindDirections } from '~/lib/site-utils';
import {
  searchSites,
  getSitesByCountry,
  getPgsitesApiKey,
  getSiteById,
  type PgSite,
} from '~/lib/pgsites-client';

export function meta() {
  return [
    { title: 'Browse Launch Sites | SoarCast' },
    { name: 'description', content: 'Browse paragliding and hang gliding launch sites.' },
  ];
}

/** Generate a URL-safe slug from a site name and pgsites UUID. */
function generateSlug(name: string, id: string): string {
  const nameSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${nameSlug}-${id.slice(0, 8)}`;
}

/** Map a PgSite from the API to the BrowseSite shape the client expects. */
function pgSiteToBrowseSite(site: PgSite): BrowseSite {
  return {
    id: site.id,
    name: site.name,
    slug: generateSlug(site.name, site.id),
    countryCode: site.country_code || null,
    region: null, // pgsites API doesn't have region
    latitude: site.latitude,
    longitude: site.longitude,
    altitude: site.altitude,
    windN: site.wind_n,
    windNe: site.wind_ne,
    windE: site.wind_e,
    windSe: site.wind_se,
    windS: site.wind_s,
    windSw: site.wind_sw,
    windW: site.wind_w,
    windNw: site.wind_nw,
    isParagliding: !!site.is_paragliding,
    isHanggliding: !!site.is_hanggliding,
    createdAt: site.created_at ? new Date(site.created_at * 1000).toISOString() : null,
  };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const db = getDb(env);
  const apiKey = getPgsitesApiKey(env);
  const url = new URL(request.url);

  const search = url.searchParams.get('search') || '';
  const country = url.searchParams.get('country') || '';
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const PAGE_SIZE = 100;
  const offset = (page - 1) * PAGE_SIZE;

  // Fetch sites from pgsites API with pagination
  let pgSites: PgSite[] = [];
  let totalSites = 0;
  if (search) {
    pgSites = await searchSites(apiKey, search, PAGE_SIZE);
    totalSites = pgSites.length; // search doesn't return total
  } else {
    const result = await getSitesByCountry(apiKey, country || 'US', PAGE_SIZE, offset);
    pgSites = result.sites;
    totalSites = result.total;
  }

  const sites: BrowseSite[] = pgSites.map(pgSiteToBrowseSite);
  const totalPages = Math.ceil(totalSites / PAGE_SIZE);

  // Popular paragliding countries — sorted by site count
  const PG_COUNTRIES = [
    'FR', 'DE', 'CH', 'IT', 'ES', 'US', 'BR', 'AT', 'AU', 'TR', 'PT', 'IN',
    'NZ', 'CO', 'JP', 'MX', 'CL', 'GR', 'SI', 'HR', 'GB', 'CZ', 'BA', 'NP',
    'ZA', 'KR', 'TW', 'AR', 'PE', 'EC', 'MA', 'PH', 'ID', 'TH', 'NO',
  ];
  const filterOptions = {
    countries: PG_COUNTRIES,
  };

  // Get user session and favorites
  const session = await getSession(request, env);
  const favoritePgsitesIds: string[] = [];
  const scores: Record<string, number | null> = {};

  if (session?.user?.id) {
    // Get user's favorited sites with their pgsites IDs
    const favs = await db
      .select({
        siteId: userFavoriteSites.siteId,
        pgsitesId: launchSites.pgsitesId,
      })
      .from(userFavoriteSites)
      .innerJoin(launchSites, eq(userFavoriteSites.siteId, launchSites.id))
      .where(eq(userFavoriteSites.userId, session.user.id));

    const localIdToPgsitesId = new Map<string, string>();
    for (const f of favs) {
      favoritePgsitesIds.push(f.pgsitesId);
      localIdToPgsitesId.set(f.siteId, f.pgsitesId);
    }

    // Get today's scores for favorited sites only
    if (favs.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const localSiteIds = favs.map((f) => f.siteId);

      const cached = await db
        .select({ siteId: forecastsCache.siteId, data: forecastsCache.data })
        .from(forecastsCache)
        .where(
          and(
            inArray(forecastsCache.siteId, localSiteIds),
            eq(forecastsCache.siteType, 'launch'),
            eq(forecastsCache.fetchDate, today),
          ),
        );

      // Build a map of local launch_sites for scoring
      const localSites = await db.query.launchSites.findMany({
        where: inArray(launchSites.id, localSiteIds),
      });
      const localSiteMap = new Map(localSites.map((s) => [s.id, s]));

      for (const row of cached) {
        const forecast = row.data as Forecast;
        const localSite = localSiteMap.get(row.siteId);
        const pgsitesId = localIdToPgsitesId.get(row.siteId);
        if (!localSite || !pgsitesId) continue;

        const dayScores = calculateDailyScores(forecast, {
          id: localSite.id,
          name: localSite.name,
          latitude: localSite.latitude,
          longitude: localSite.longitude,
          elevation: localSite.altitude || 0,
          idealWindDirections: getIdealWindDirections(localSite),
          maxWindSpeed: localSite.maxWindSpeed || 40,
          createdAt: localSite.createdAt?.toISOString() || '',
          updatedAt: localSite.updatedAt?.toISOString() || '',
        });
        // Key scores by pgsites UUID so client can look them up
        scores[pgsitesId] = dayScores.length > 0 ? dayScores[0].overallScore : null;
      }
    }
  }

  return {
    sites,
    filterOptions,
    scores,
    favoritePgsitesIds,
    searchParams: { search, country },
    pagination: { page, totalPages, totalSites, pageSize: PAGE_SIZE },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb(env);
  const apiKey = getPgsitesApiKey(env);
  const formData = await request.formData();
  const intent = formData.get('intent');
  const pgsitesId = formData.get('pgsitesId') as string;

  switch (intent) {
    case 'favorite': {
      // Check if site already exists locally
      let localSite = await db.query.launchSites.findFirst({
        where: eq(launchSites.pgsitesId, pgsitesId),
      });

      // If not, fetch from pgsites API and insert
      if (!localSite) {
        const pgSite = await getSiteById(apiKey, pgsitesId);
        if (!pgSite) {
          return Response.json({ error: 'Site not found' }, { status: 404 });
        }

        const slug = generateSlug(pgSite.name, pgSite.id);
        const id = crypto.randomUUID();

        await db.insert(launchSites).values({
          id,
          name: pgSite.name,
          slug,
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
          source: 'pgsites',
          pgsitesId: pgSite.id,
          description: pgSite.description,
          pgeLink: pgSite.pge_link,
        });

        localSite = await db.query.launchSites.findFirst({
          where: eq(launchSites.id, id),
        });
      }

      if (localSite) {
        await db.insert(userFavoriteSites).values({
          userId: session.user.id,
          siteId: localSite.id,
          notify: false,
        });
      }

      return { success: true };
    }
    case 'unfavorite': {
      // Look up local site by pgsites ID
      const localSite = await db.query.launchSites.findFirst({
        where: eq(launchSites.pgsitesId, pgsitesId),
      });

      if (localSite) {
        await db
          .delete(userFavoriteSites)
          .where(
            and(
              eq(userFavoriteSites.userId, session.user.id),
              eq(userFavoriteSites.siteId, localSite.id),
            ),
          );
      }

      return { success: true };
    }
    default:
      return { error: 'Unknown action' };
  }
}

export default function BrowseSitesPage() {
  const { sites, filterOptions, scores, favoritePgsitesIds, searchParams, pagination } =
    useLoaderData<typeof loader>();

  return (
    <SitesBrowseClient
      initialSites={sites}
      filterOptions={filterOptions}
      searchParams={searchParams}
      siteScores={scores}
      initialFavoriteIds={favoritePgsitesIds}
      pagination={pagination}
    />
  );
}
