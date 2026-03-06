import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getLaunchSiteBySlug, isSiteFavorited } from '../browse/actions';
import { MapDisplayWrapper } from '@/components/map-display-wrapper';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LaunchSiteFavoriteButton } from './favorite-button';
import { RecentSiteTracker } from '@/components/recent-site-tracker';
import { SiteDetailForecast } from './site-detail-forecast';
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

/**
 * Loading fallback for forecast section
 */
function ForecastSkeleton() {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    </Card>
  );
}

export default async function LaunchSiteDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Fetch site info first (fast) - this doesn't block the page
  const site = await getLaunchSiteBySlug(slug);

  if (!site) {
    notFound();
  }

  // Fetch session and favorites in parallel (relatively fast)
  const [session, isFavorited] = await Promise.all([auth(), isSiteFavorited(site.id)]);

  return (
    <div className="space-y-6">
      {/* Track recently viewed sites */}
      <RecentSiteTracker site={{ id: site.id, name: site.name, slug: site.slug }} />

      {/* Header with back navigation - renders immediately */}
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

      {/* Forecast section - streams in progressively */}
      <Suspense fallback={<ForecastSkeleton />}>
        <SiteDetailForecast site={site} />
      </Suspense>
    </div>
  );
}
