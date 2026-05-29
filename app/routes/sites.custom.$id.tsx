import { useLoaderData, Link } from 'react-router';
import type { Route } from './+types/sites.custom.$id';
import { getDb } from '~/app/lib/db.server';
import { requireAuth } from '~/app/lib/auth.server';
import { customSites } from '~/db/schema';
import { eq, and } from 'drizzle-orm';
import { getForecast, setWeatherDb } from '~/lib/weather';
import { calculateDailyScores, calculateDailyScoresFromProfile } from '~/lib/scoring';
import { getAtmosphericProfile, setProfileDb } from '~/lib/weather-profile';
import { SiteDetailClient } from '@/components/site-detail-client';
import { MapDisplayWrapper } from '@/components/map-display-wrapper';
import { RecentSiteTracker } from '@/components/recent-site-tracker';
import { WindDirectionBadges } from '@/components/wind-direction-badges';
import { ElevationDisplay } from '@/components/elevation-display';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import type { Site } from '~/types';

export function meta({ data }: Route.MetaArgs) {
  if (!data?.site) return [{ title: 'Site Not Found | SoarCast' }];
  return [
    { title: `${data.site.name} | SoarCast` },
    { name: 'description', content: `7-day flying forecast for ${data.site.name}.` },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const db = getDb(env);
  const { id } = params;

  // Scope to the authenticated owner — never expose another user's custom site.
  const customSite = await db.query.customSites.findFirst({
    where: and(eq(customSites.id, id!), eq(customSites.userId, session.user.id)),
  });

  if (!customSite) {
    throw new Response('Site not found', { status: 404 });
  }

  const site: Site = {
    id: customSite.id,
    name: customSite.name,
    latitude: parseFloat(customSite.latitude),
    longitude: parseFloat(customSite.longitude),
    elevation: customSite.elevation,
    idealWindDirections: customSite.idealWindDirections,
    maxWindSpeed: customSite.maxWindSpeed,
    notes: undefined,
    createdAt: new Date(customSite.createdAt).toISOString(),
    updatedAt: new Date(customSite.updatedAt).toISOString(),
  };

  let forecast = null;
  let scores = null;
  let forecastError = null;

  try {
    setWeatherDb(db);
    setProfileDb(db);

    const [forecastResult, profileResult] = await Promise.allSettled([
      getForecast(site.id, site.latitude, site.longitude, 'custom'),
      getAtmosphericProfile(site.latitude, site.longitude, 7),
    ]);

    if (forecastResult.status === 'rejected') {
      forecastError =
        forecastResult.reason instanceof Error
          ? forecastResult.reason.message
          : 'Failed to fetch forecast';
    } else {
      forecast = forecastResult.value.forecast;
    }

    if (forecast) {
      scores =
        profileResult.status === 'fulfilled'
          ? calculateDailyScoresFromProfile(profileResult.value.profile, forecast, site)
          : calculateDailyScores(forecast, site);
    }
  } catch (e) {
    forecastError = e instanceof Error ? e.message : 'Failed to fetch forecast';
  }

  return { site, forecast, scores, forecastError };
}

export default function CustomSiteDetailPage() {
  const { site, forecast, scores, forecastError } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <RecentSiteTracker site={{ id: site.id, name: site.name, slug: `custom/${site.id}` }} />

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Link to="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* Site name */}
      <div>
        <h1 className="text-3xl font-bold">{site.name}</h1>
        <p className="text-lg text-muted-foreground mt-1">Custom site</p>
      </div>

      {/* Forecast section with windgram and scoring */}
      {forecastError ? (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-700 dark:text-red-400">
          <p className="font-medium">Error loading forecast</p>
          <p className="text-sm">
            We couldn&apos;t load the forecast right now. Please try again in a little while.
          </p>
        </div>
      ) : forecast && scores ? (
        <SiteDetailClient site={site} forecast={forecast} scores={scores} />
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No forecast data available</p>
        </div>
      )}

      {/* Location & Details — always visible */}
      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4">Location &amp; Details</h2>
        <div className="space-y-3 text-sm">
          {site.elevation > 0 && (
            <div>
              <ElevationDisplay elevationMeters={site.elevation} label="Takeoff" />
            </div>
          )}
          {site.idealWindDirections.length > 0 && (
            <div>
              <div className="font-medium mb-2">Ideal Wind Directions:</div>
              <WindDirectionBadges directions={site.idealWindDirections} />
            </div>
          )}
          <div>
            <span className="font-medium">Max Wind Speed:</span>{' '}
            <span className="text-muted-foreground">{site.maxWindSpeed} km/h</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Location: {site.latitude.toFixed(4)}°, {site.longitude.toFixed(4)}°
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Location Map</h3>
            <MapDisplayWrapper latitude={site.latitude} longitude={site.longitude} />
          </div>
        </div>
      </Card>
    </div>
  );
}
