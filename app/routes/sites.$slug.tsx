import { useLoaderData, useFetcher, Link } from 'react-router';
import type { Route } from './+types/sites.$slug';
import { getDb } from '~/app/lib/db.server';
import { getSession } from '~/app/lib/auth.server';
import { launchSites, userFavoriteSites } from '~/db/schema';
import { eq, and } from 'drizzle-orm';
import { getIdealWindDirections, getOrientations } from '~/lib/site-utils';
import { getForecast, setWeatherDb } from '~/lib/weather';
import { calculateDailyScores, calculateDailyScoresFromProfile } from '~/lib/scoring';
import { getAtmosphericProfile, setProfileDb } from '~/lib/weather-profile';
import { SiteDetailClient } from '@/components/site-detail-client';
import { MapDisplayWrapper } from '@/components/map-display-wrapper';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ArrowLeft, Heart } from 'lucide-react';
import { RecentSiteTracker } from '@/components/recent-site-tracker';
import { OrientationBadges } from '@/components/orientation-badges';
import { WindDirectionBadges } from '@/components/wind-direction-badges';
import { ElevationDisplay } from '@/components/elevation-display';
import {
  searchSites,
  getSiteById,
  getPgsitesApiKey,
  type PgSite,
} from '~/lib/pgsites-client';

/** Site shape used by the detail page — works for both local and pgsites-only sites. */
interface DetailSite {
  id: string;
  name: string;
  slug: string;
  countryCode: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  landingAltitude: number | null;
  landingLatitude: number | null;
  landingLongitude: number | null;
  windN: number;
  windNe: number;
  windE: number;
  windSe: number;
  windS: number;
  windSw: number;
  windW: number;
  windNw: number;
  isParagliding: boolean;
  isHanggliding: boolean;
  maxWindSpeed: number | null;
  description: string | null;
  landingDescription: string | null;
  pgeLink: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** Generate a URL-safe slug from a site name and pgsites UUID.
 *  Uses -- separator so the UUID can be reliably extracted. */
function generateSlug(name: string, id: string): string {
  const nameSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${nameSlug}--${id}`;
}

/** Extract the pgsites UUID from a slug. Supports both formats:
 *  - New: "site-name--uuid-here" (double-dash separator)
 *  - Legacy local: slugs from local launch_sites table */
function extractPgsitesId(slug: string): string | null {
  const doubleDash = slug.indexOf('--');
  if (doubleDash !== -1) {
    return slug.slice(doubleDash + 2);
  }
  return null;
}

/** Map a PgSite from the API to the DetailSite shape. */
function pgSiteToDetailSite(site: PgSite, slug: string): DetailSite {
  return {
    id: site.id,
    name: site.name,
    slug,
    countryCode: site.country_code || null,
    region: null,
    latitude: site.latitude,
    longitude: site.longitude,
    altitude: site.altitude,
    landingAltitude: site.landing_altitude,
    landingLatitude: site.landing_latitude,
    landingLongitude: site.landing_longitude,
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
    maxWindSpeed: null,
    description: site.description || null,
    landingDescription: null,
    pgeLink: site.pge_link || null,
    source: 'pgsites',
    createdAt: site.created_at ? new Date(site.created_at * 1000).toISOString() : new Date().toISOString(),
    updatedAt: site.updated_at ? new Date(site.updated_at * 1000).toISOString() : new Date().toISOString(),
  };
}

/** Map a local LaunchSite DB row to the DetailSite shape. */
function localSiteToDetailSite(site: typeof launchSites.$inferSelect): DetailSite {
  return {
    id: site.id,
    name: site.name,
    slug: site.slug,
    countryCode: site.countryCode || null,
    region: site.region || null,
    latitude: site.latitude,
    longitude: site.longitude,
    altitude: site.altitude,
    landingAltitude: site.landingAltitude,
    landingLatitude: site.landingLatitude,
    landingLongitude: site.landingLongitude,
    windN: site.windN,
    windNe: site.windNe,
    windE: site.windE,
    windSe: site.windSe,
    windS: site.windS,
    windSw: site.windSw,
    windW: site.windW,
    windNw: site.windNw,
    isParagliding: site.isParagliding,
    isHanggliding: site.isHanggliding,
    maxWindSpeed: site.maxWindSpeed,
    description: site.description || null,
    landingDescription: site.landingDescription || null,
    pgeLink: site.pgeLink || null,
    source: site.source,
    createdAt: site.createdAt ? new Date(site.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: site.updatedAt ? new Date(site.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.site) return [{ title: 'Site Not Found | SoarCast' }];
  return [
    { title: `${data.site.name} | SoarCast` },
    {
      name: 'description',
      content: `${data.site.name} - ${data.site.region ? `${data.site.region}, ` : ''}${data.site.countryCode || 'Launch Site'}`,
    },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const db = getDb(env);
  const apiKey = getPgsitesApiKey(env);
  const { slug } = params;

  // 1. Try local launch_sites first (fast, for cached/favorited sites)
  const localSite = await db.query.launchSites.findFirst({
    where: eq(launchSites.slug, slug!),
  });

  let site: DetailSite;
  let localSiteId: string | null = null;

  if (localSite) {
    site = localSiteToDetailSite(localSite);
    localSiteId = localSite.id;
  } else {
    // 2. Not found locally — extract pgsites UUID from slug and do direct API lookup
    const pgsitesId = extractPgsitesId(slug!);
    let pgSite: PgSite | null = null;

    if (pgsitesId) {
      pgSite = await getSiteById(apiKey, pgsitesId);
    }

    // Fallback: search by the name portion of the slug
    if (!pgSite) {
      const nameQuery = slug!.split('--')[0].replace(/-/g, ' ');
      if (nameQuery) {
        try {
          const results = await searchSites(apiKey, nameQuery, 5);
          if (results.length > 0) pgSite = results[0];
        } catch {
          // search failed
        }
      }
    }

    if (!pgSite) {
      throw new Response('Site not found', { status: 404 });
    }

    site = pgSiteToDetailSite(pgSite, slug!);
  }

  // Check if user has favorited this site
  const session = await getSession(request, env);
  let isFavorited = false;
  let customMaxWind: number | null = null;

  if (session?.user?.id) {
    // Check favorites — by local ID if cached, or by pgsites ID
    if (localSiteId) {
      const favorite = await db.query.userFavoriteSites.findFirst({
        where: and(
          eq(userFavoriteSites.userId, session.user.id),
          eq(userFavoriteSites.siteId, localSiteId),
        ),
      });
      isFavorited = !!favorite;
      customMaxWind = favorite?.customMaxWind ?? null;
    } else {
      // Check if this pgsites site was favorited (look up by pgsitesId)
      const cached = await db.query.launchSites.findFirst({
        where: eq(launchSites.pgsitesId, site.id),
      });
      if (cached) {
        localSiteId = cached.id;
        const favorite = await db.query.userFavoriteSites.findFirst({
          where: and(
            eq(userFavoriteSites.userId, session.user.id),
            eq(userFavoriteSites.siteId, cached.id),
          ),
        });
        isFavorited = !!favorite;
        customMaxWind = favorite?.customMaxWind ?? null;
      }
    }
  }

  // Fetch forecast and scoring data for ALL sites (local or pgsites API)
  // Use local site ID if available (favorited/cached), otherwise use pgsites UUID
  const forecastSiteId = localSiteId || site.id;
  // All pgsites sites are launch sites — use 'launch' as the cache discriminator
  const forecastSiteType: 'launch' | 'custom' | 'legacy' = 'launch';
  let forecast = null;
  let scores = null;
  let forecastError = null;

  try {
    setWeatherDb(db);
    setProfileDb(db);

    const forecastResult = await getForecast(forecastSiteId, site.latitude, site.longitude, forecastSiteType);
    forecast = forecastResult.forecast;

    if (forecast) {
      const siteForScoring = {
        id: forecastSiteId,
        name: site.name,
        latitude: site.latitude,
        longitude: site.longitude,
        elevation: site.altitude || 0,
        idealWindDirections: getIdealWindDirections(site),
        maxWindSpeed: customMaxWind || site.maxWindSpeed || 40,
        createdAt: site.createdAt,
        updatedAt: site.updatedAt,
      };

      try {
        const profileResult = await getAtmosphericProfile(site.latitude, site.longitude, 7);
        scores = calculateDailyScoresFromProfile(profileResult.profile, forecast, siteForScoring);
      } catch {
        scores = calculateDailyScores(forecast, siteForScoring);
      }
    }
  } catch (e) {
    forecastError = e instanceof Error ? e.message : 'Failed to fetch forecast';
  }

  return {
    site,
    pgsitesId: localSite?.pgsitesId ?? site.id,
    isFavorited,
    customMaxWind,
    isAuthenticated: !!session?.user?.id,
    forecast,
    scores,
    forecastError,
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

function FavoriteButton({
  pgsitesId,
  initialIsFavorited,
  isAuthenticated,
}: {
  pgsitesId: string;
  initialIsFavorited: boolean;
  isAuthenticated: boolean;
}) {
  const fetcher = useFetcher();
  const optimisticFavorited = fetcher.formData
    ? fetcher.formData.get('intent') === 'favorite'
    : initialIsFavorited;

  if (!isAuthenticated) {
    return (
      <Link to="/auth/signin">
        <Button variant="outline" size="sm">
          <Heart className="mr-2 h-4 w-4" />
          Sign in to favorite
        </Button>
      </Link>
    );
  }

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value={optimisticFavorited ? 'unfavorite' : 'favorite'} />
      <input type="hidden" name="pgsitesId" value={pgsitesId} />
      <Button
        type="submit"
        variant={optimisticFavorited ? 'default' : 'outline'}
        size="sm"
        disabled={fetcher.state !== 'idle'}
      >
        <Heart className={`mr-2 h-4 w-4 ${optimisticFavorited ? 'fill-current' : ''}`} />
        {optimisticFavorited ? 'Favorited' : 'Add to Favorites'}
      </Button>
    </fetcher.Form>
  );
}

export default function SiteDetailPage() {
  const { site, pgsitesId, isFavorited, customMaxWind, isAuthenticated, forecast, scores, forecastError } =
    useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <RecentSiteTracker site={{ id: site.id, name: site.name, slug: site.slug }} />

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Link to="/sites/browse">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Browse
          </Button>
        </Link>
        <FavoriteButton
          pgsitesId={pgsitesId}
          initialIsFavorited={isFavorited}
          isAuthenticated={isAuthenticated}
        />
      </div>

      {/* Site name */}
      <div>
        <h1 className="text-3xl font-bold">{site.name}</h1>
        {(site.region || site.countryCode) && (
          <p className="text-lg text-muted-foreground mt-1">
            {site.region ? `${site.region}, ` : ''}{site.countryCode || ''}
          </p>
        )}
      </div>

      {/* Forecast section with windgram and scoring */}
      {forecastError ? (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-700 dark:text-red-400">
          <p className="font-medium">Error loading forecast</p>
          <p className="text-sm">{forecastError}</p>
        </div>
      ) : forecast && scores ? (
        <SiteDetailClient
          site={{
            id: site.id,
            name: site.name,
            latitude: site.latitude,
            longitude: site.longitude,
            elevation: site.altitude || 0,
            idealWindDirections: getIdealWindDirections(site),
            maxWindSpeed: customMaxWind || site.maxWindSpeed || 40,
            createdAt: site.createdAt,
            updatedAt: site.updatedAt,
          }}
          forecast={forecast}
          scores={scores}
        />
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No forecast data available</p>
        </div>
      )}

      {/* Location & Details accordion */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="details">
          <AccordionTrigger className="text-lg font-semibold">
            Location &amp; Details
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-6">
              <div className="space-y-3 text-sm">
                {site.altitude && (
                  <div>
                    <ElevationDisplay elevationMeters={site.altitude} label="Takeoff" />
                  </div>
                )}
                {site.landingAltitude && (
                  <div>
                    <ElevationDisplay elevationMeters={site.landingAltitude} label="Landing" />
                  </div>
                )}
                {(site.isParagliding || site.isHanggliding) && (
                  <div>
                    <span className="font-medium">Flying Types:</span>{' '}
                    <span className="text-muted-foreground">
                      {[site.isParagliding && 'paragliding', site.isHanggliding && 'hanggliding']
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}
                {(() => {
                  const orientations = getOrientations(site);
                  return Object.values(orientations).some((r: number) => r >= 1) ? (
                    <div>
                      <div className="font-medium mb-2">Orientations:</div>
                      <OrientationBadges orientations={orientations} />
                    </div>
                  ) : null;
                })()}
                {(() => {
                  const idealDirs = getIdealWindDirections(site);
                  return idealDirs.length > 0 ? (
                    <div>
                      <div className="font-medium mb-2">Ideal Wind Directions:</div>
                      <WindDirectionBadges directions={idealDirs} />
                    </div>
                  ) : null;
                })()}
                <div>
                  <span className="font-medium">Max Wind Speed:</span>{' '}
                  {customMaxWind ? (
                    <span className="text-muted-foreground">
                      {customMaxWind} km/h <span className="text-xs">(your limit)</span>
                      {site.maxWindSpeed && (
                        <span className="text-xs ml-1 opacity-60">
                          · site default: {site.maxWindSpeed} km/h
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {site.maxWindSpeed ? `${site.maxWindSpeed} km/h` : '~40 km/h (default)'}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Location: {site.latitude.toFixed(4)}°, {site.longitude.toFixed(4)}°
                </div>
              </div>

              {site.description && (
                <div>
                  <h3 className="font-semibold mb-2">Site Description</h3>
                  <p className="text-sm text-muted-foreground">{site.description}</p>
                </div>
              )}

              {site.landingLatitude && site.landingLongitude && site.landingDescription && (
                <div>
                  <h3 className="font-semibold mb-2">Landing Information</h3>
                  <p className="text-sm text-muted-foreground">{site.landingDescription}</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium mb-2">Location Map</h3>
                <MapDisplayWrapper
                  latitude={site.latitude}
                  longitude={site.longitude}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Data source:{' '}
                {site.source === 'pgsites' ? 'ParaglidingEarth.com' : site.source}
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
