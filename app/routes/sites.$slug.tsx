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
  const { slug } = params;

  const site = await db.query.launchSites.findFirst({
    where: eq(launchSites.slug, slug!),
  });

  if (!site) {
    throw new Response('Site not found', { status: 404 });
  }

  // Check if user has favorited this site
  const session = await getSession(request, env);
  let isFavorited = false;
  let customMaxWind: number | null = null;

  if (session?.user?.id) {
    const favorite = await db.query.userFavoriteSites.findFirst({
      where: and(
        eq(userFavoriteSites.userId, session.user.id),
        eq(userFavoriteSites.siteId, site.id),
      ),
    });
    isFavorited = !!favorite;
    customMaxWind = favorite?.customMaxWind ?? null;
  }

  // Initialize weather/profile DBs for this request
  setWeatherDb(db);
  setProfileDb(db);

  // Fetch forecast and scoring data
  let forecast = null;
  let scores = null;
  let forecastError = null;

  try {
    const lat = site.latitude;
    const lng = site.longitude;
    const forecastResult = await getForecast(site.id, lat, lng, 'launch');
    forecast = forecastResult.forecast;

    if (forecast) {
      const siteForScoring = {
        id: site.id,
        name: site.name,
        latitude: lat,
        longitude: lng,
        elevation: site.altitude || 0,
        idealWindDirections: getIdealWindDirections(site),
        maxWindSpeed: customMaxWind || site.maxWindSpeed || 40,
        createdAt: new Date(site.createdAt).toISOString(),
        updatedAt: new Date(site.updatedAt).toISOString(),
      };

      try {
        const profileResult = await getAtmosphericProfile(lat, lng, 7);
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
    isFavorited,
    customMaxWind,
    isAuthenticated: !!session?.user?.id,
    forecast,
    scores,
    forecastError,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb(env);
  const formData = await request.formData();
  const intent = formData.get('intent');
  const { slug } = params;

  const site = await db.query.launchSites.findFirst({
    where: eq(launchSites.slug, slug!),
  });

  if (!site) {
    return Response.json({ error: 'Site not found' }, { status: 404 });
  }

  switch (intent) {
    case 'favorite': {
      await db.insert(userFavoriteSites).values({
        userId: session.user.id,
        siteId: site.id,
        notify: false,
      });
      return { success: true };
    }

    case 'unfavorite': {
      await db
        .delete(userFavoriteSites)
        .where(
          and(eq(userFavoriteSites.userId, session.user.id), eq(userFavoriteSites.siteId, site.id)),
        );
      return { success: true };
    }

    default:
      return { error: 'Unknown action' };
  }
}

function FavoriteButton({
  initialIsFavorited,
  isAuthenticated,
}: {
  siteId: string;
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
  const { site, isFavorited, customMaxWind, isAuthenticated, forecast, scores, forecastError } =
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
          siteId={site.id}
          initialIsFavorited={isFavorited}
          isAuthenticated={isAuthenticated}
        />
      </div>

      {/* Site name */}
      <div>
        <h1 className="text-3xl font-bold">{site.name}</h1>
        {site.region && site.countryCode && (
          <p className="text-lg text-muted-foreground mt-1">
            {site.region}, {site.countryCode}
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
            createdAt: new Date(site.createdAt).toISOString(),
            updatedAt: new Date(site.updatedAt).toISOString(),
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
