import { useLoaderData } from 'react-router';
import type { Route } from './+types/sites.browse';
import { getDb } from '~/app/lib/db.server';
import { getSession } from '~/app/lib/auth.server';
import { launchSites, userFavoriteSites } from '~/db/schema';
import { and, eq } from 'drizzle-orm';
import { SitesBrowseClient, type BrowseSite } from '@/components/sites-browse-client';
import { launchSiteValuesFromPgSite } from '~/lib/launch-sites';
import {
  searchSitesAndPlaces,
  nearbySites,
  getPgsitesApiKey,
  getSiteById,
  pgsitesSlug,
  type PgSite,
} from '~/lib/pgsites-client';

// Default map center — Tiger Mountain, WA. Pre-loaded server-side so the
// map is populated the moment the page renders (no client-side fetch delay).
const DEFAULT_LAT = 47.44;
const DEFAULT_LNG = -121.97;
const DEFAULT_RADIUS_KM = 1300;

export function meta() {
  return [
    { title: 'Browse Launch Sites | SoarCast' },
    {
      name: 'description',
      content: 'Discover paragliding and hang gliding launch sites worldwide.',
    },
  ];
}

function pgSiteToBrowseSite(site: PgSite): BrowseSite {
  return {
    id: site.id,
    name: site.name,
    slug: pgsitesSlug(site.name, site.id),
    countryCode: site.country_code || null,
    region: null,
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
    flownPilots: site.flown_pilots ?? null,
    foundFromFlights: site.source === 'flown',
  };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const db = getDb(env);
  const apiKey = getPgsitesApiKey(env);
  const url = new URL(request.url);

  const search = url.searchParams.get('search') ?? '';

  // Fetch sites server-side so the map is populated on first paint.
  // Search → use the search API. Default → pre-load the Tiger Mountain area
  // so the user sees sites immediately without waiting for client-side JS.
  let sites: BrowseSite[] = [];
  let sitesMode: 'search' | 'preloaded' | 'empty' = 'empty';
  let places: string[] = [];

  if (search) {
    // Name matches first, then the launches near any place the search names
    // ("Cali"), the ones most pilots fly first
    const found = await searchSitesAndPlaces(apiKey, search, 200);
    const seen = new Set(found.sites.map((s) => s.id));
    const nearPlaces = found.places
      .flatMap((p) => p.sites)
      .filter((s) => !seen.has(s.id) && seen.add(s.id));
    sites = [...found.sites, ...nearPlaces].map(pgSiteToBrowseSite);
    places = found.places.map((p) => [p.name, p.region, p.country_code].filter(Boolean).join(', '));
    sitesMode = 'search';
  } else {
    try {
      const pgSites = await nearbySites(apiKey, DEFAULT_LAT, DEFAULT_LNG, DEFAULT_RADIUS_KM, 500);
      sites = pgSites.map(pgSiteToBrowseSite);
      sitesMode = 'preloaded';
    } catch {
      // If pgsites is unavailable, the map will still load via client-side fetch
      sitesMode = 'empty';
    }
  }

  // Get user session and favorites
  const session = await getSession(request, env);
  const favoritePgsitesIds: string[] = [];

  if (session?.user?.id) {
    const favs = await db
      .select({ pgsitesId: launchSites.pgsitesId })
      .from(userFavoriteSites)
      .innerJoin(launchSites, eq(userFavoriteSites.siteId, launchSites.id))
      .where(eq(userFavoriteSites.userId, session.user.id));

    for (const f of favs) favoritePgsitesIds.push(f.pgsitesId);
  }

  return {
    sites,
    sitesMode,
    places,
    favoritePgsitesIds,
    searchParams: { search },
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
      let localSite = await db.query.launchSites.findFirst({
        where: eq(launchSites.pgsitesId, pgsitesId),
      });

      if (!localSite) {
        const pgSite = await getSiteById(apiKey, pgsitesId);
        if (!pgSite) {
          return Response.json({ error: 'Site not found' }, { status: 404 });
        }

        const id = crypto.randomUUID();

        await db.insert(launchSites).values({
          id,
          ...launchSiteValuesFromPgSite(pgSite),
          source: 'pgsites',
          pgsitesId: pgSite.id,
        });

        localSite = await db.query.launchSites.findFirst({
          where: eq(launchSites.id, id),
        });
      }

      if (localSite) {
        // onConflictDoNothing: re-favoriting an already-favorited site must not
        // violate the unique(userId, siteId) constraint and 500.
        await db
          .insert(userFavoriteSites)
          .values({
            userId: session.user.id,
            siteId: localSite.id,
            notify: false,
          })
          .onConflictDoNothing();
      }

      return { success: true };
    }
    case 'unfavorite': {
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
  const { sites, sitesMode, places, favoritePgsitesIds, searchParams } =
    useLoaderData<typeof loader>();

  return (
    <SitesBrowseClient
      initialSites={sites}
      sitesMode={sitesMode}
      searchParams={searchParams}
      places={places}
      initialFavoriteIds={favoritePgsitesIds}
    />
  );
}
