import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLaunchSiteBySlug, isSiteFavorited } from '../browse/actions';
import { getForecast } from '@/lib/weather';
import { SiteDetailClient } from '@/components/site-detail-client';
import { MapDisplayWrapper } from '@/components/map-display-wrapper';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LaunchSiteFavoriteButton } from './favorite-button';
import { auth } from '@/auth';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getLaunchSiteBySlug(slug);

  if (!site) {
    return {
      title: 'Site Not Found',
    };
  }

  return {
    title: site.name,
    description: `${site.name} - ${site.region ? `${site.region}, ` : ''}${site.countryCode || 'Launch Site'}. ${site.description || 'Paragliding launch site information and weather forecast.'}`,
  };
}

export default async function LaunchSiteDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await getLaunchSiteBySlug(slug);
  const session = await auth();

  if (!site) {
    notFound();
  }

  const isFavorited = await isSiteFavorited(site.id);

  // Fetch forecast for this site
  let forecast = null;
  let scores = null;
  let error = null;

  try {
    const { calculateDailyScores } = await import('@/lib/scoring');
    const lat = parseFloat(site.latitude);
    const lng = parseFloat(site.longitude);
    forecast = await getForecast(site.id, lat, lng, 'launch');

    if (forecast) {
      // Convert launch site to the format expected by scoring
      const siteForScoring = {
        id: site.id,
        name: site.name,
        latitude: lat,
        longitude: lng,
        elevation: site.elevation || 0,
        idealWindDirections: site.idealWindDirections || [],
        maxWindSpeed: site.maxWindSpeed || 40,
        createdAt: new Date(site.createdAt).toISOString(),
        updatedAt: new Date(site.updatedAt).toISOString(),
      };
      scores = calculateDailyScores(forecast, siteForScoring);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to fetch forecast';
  }

  return (
    <div className="space-y-6">
      {/* Header with back navigation */}
      <div>
        <Link href="/sites/browse">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Browse
          </Button>
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{site.name}</h1>
            <div className="mt-2 text-sm text-muted-foreground space-y-1">
              {site.region && site.countryCode && (
                <p>
                  {site.region}, {site.countryCode}
                </p>
              )}
              <p>
                Location: {parseFloat(site.latitude).toFixed(4)}°,{' '}
                {parseFloat(site.longitude).toFixed(4)}°
              </p>
              {site.elevation && <p>Takeoff Elevation: {site.elevation}m</p>}
              {site.landingElevation && <p>Landing Elevation: {site.landingElevation}m</p>}
              {site.flyingTypes && site.flyingTypes.length > 0 && (
                <p>Flying Types: {site.flyingTypes.join(', ')}</p>
              )}
              {site.orientations && (
                <p>
                  Orientations:{' '}
                  {Object.entries(site.orientations)
                    .filter(([, rating]) => rating >= 1)
                    .map(([dir, rating]) => `${dir}${rating === 2 ? '✓✓' : '✓'}`)
                    .join(', ')}
                </p>
              )}
              {site.idealWindDirections && site.idealWindDirections.length > 0 && (
                <p>
                  Ideal Wind Directions: {site.idealWindDirections.map((d) => `${d}°`).join(', ')}
                </p>
              )}
              {site.maxWindSpeed && <p>Max Wind Speed: {site.maxWindSpeed} km/h</p>}
            </div>
          </div>

          <div className="shrink-0">
            <LaunchSiteFavoriteButton
              siteId={site.id}
              initialIsFavorited={isFavorited}
              isAuthenticated={!!session}
            />
          </div>
        </div>

        {site.description && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/50">
            <p className="text-sm">{site.description}</p>
          </div>
        )}

        {site.landingLat && site.landingLng && site.landingDescription && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/50">
            <h3 className="font-semibold mb-2">Landing Information</h3>
            <p className="text-sm text-muted-foreground">{site.landingDescription}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Landing: {parseFloat(site.landingLat).toFixed(4)}°,{' '}
              {parseFloat(site.landingLng).toFixed(4)}°
            </p>
          </div>
        )}

        {/* Site location map */}
        <div className="mt-4">
          <MapDisplayWrapper
            latitude={parseFloat(site.latitude)}
            longitude={parseFloat(site.longitude)}
          />
        </div>

        {/* Source attribution */}
        <div className="mt-2 text-xs text-muted-foreground">
          Source: {site.source === 'paraglidingearth' ? 'ParaglidingEarth.com' : site.source}
        </div>
      </div>

      {/* Forecast display or error */}
      {error ? (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-700 dark:text-red-400">
          <p className="font-medium">Error loading forecast</p>
          <p className="text-sm">{error}</p>
        </div>
      ) : !forecast || !scores ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No forecast data available</p>
        </div>
      ) : (
        <SiteDetailClient
          site={{
            id: site.id,
            name: site.name,
            latitude: parseFloat(site.latitude),
            longitude: parseFloat(site.longitude),
            elevation: site.elevation || 0,
            idealWindDirections: site.idealWindDirections || [],
            maxWindSpeed: site.maxWindSpeed || 40,
            createdAt: new Date(site.createdAt).toISOString(),
            updatedAt: new Date(site.updatedAt).toISOString(),
          }}
          forecast={forecast}
          scores={scores}
        />
      )}
    </div>
  );
}
