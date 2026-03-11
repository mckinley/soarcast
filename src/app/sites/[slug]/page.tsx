import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getLaunchSiteBySlug, isSiteFavorited } from '../browse/actions';
import { MapDisplayWrapper } from '@/components/map-display-wrapper';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LaunchSiteFavoriteButton } from './favorite-button';
import { RecentSiteTracker } from '@/components/recent-site-tracker';
import { SiteDetailForecast } from './site-detail-forecast';
import { auth } from '@/auth';
import { OrientationBadges } from '@/components/orientation-badges';
import { WindDirectionBadges } from '@/components/wind-direction-badges';
import { ElevationDisplay } from '@/components/elevation-display';

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

      {/* Header with back navigation and favorite button - renders immediately */}
      <div className="flex items-center justify-between gap-4">
        <Link href="/sites/browse">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Browse
          </Button>
        </Link>

        <LaunchSiteFavoriteButton
          siteId={site.id}
          initialIsFavorited={isFavorited}
          isAuthenticated={!!session}
        />
      </div>

      {/* Site name, location, and flyability badge - moved to forecast section */}
      <div>
        <h1 className="text-3xl font-bold">{site.name}</h1>
        {site.region && site.countryCode && (
          <p className="text-lg text-muted-foreground mt-1">
            {site.region}, {site.countryCode}
          </p>
        )}
      </div>

      {/* Forecast section with flyability badge and summary - streams in progressively */}
      <Suspense fallback={<ForecastSkeleton />}>
        <SiteDetailForecast site={site} />
      </Suspense>

      {/* Location & Details - collapsible accordion */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="details">
          <AccordionTrigger className="text-lg font-semibold">
            Location &amp; Details
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-6">
              {/* Key information */}
              <div className="space-y-3 text-sm">
                {/* Elevation */}
                {site.elevation && (
                  <div>
                    <ElevationDisplay elevationMeters={site.elevation} label="Takeoff" />
                  </div>
                )}
                {site.landingElevation && (
                  <div>
                    <ElevationDisplay elevationMeters={site.landingElevation} label="Landing" />
                  </div>
                )}

                {/* Flying types */}
                {site.flyingTypes && site.flyingTypes.length > 0 && (
                  <div>
                    <span className="font-medium">Flying Types:</span>{' '}
                    <span className="text-muted-foreground">{site.flyingTypes.join(', ')}</span>
                  </div>
                )}

                {/* Orientations - badge display */}
                {site.orientations && Object.values(site.orientations).some((r) => r >= 1) && (
                  <div>
                    <div className="font-medium mb-2">Orientations:</div>
                    <OrientationBadges orientations={site.orientations} />
                  </div>
                )}

                {/* Ideal wind directions - badge display */}
                {site.idealWindDirections && site.idealWindDirections.length > 0 && (
                  <div>
                    <div className="font-medium mb-2">Ideal Wind Directions:</div>
                    <WindDirectionBadges directions={site.idealWindDirections} />
                  </div>
                )}

                {/* Max wind speed */}
                <div>
                  <span className="font-medium">Max Wind Speed:</span>{' '}
                  <span className="text-muted-foreground">
                    {site.maxWindSpeed ? `${site.maxWindSpeed} km/h` : '~40 km/h (default)'}
                  </span>
                </div>

                {/* Coordinates - less prominent */}
                <div className="text-xs text-muted-foreground">
                  Location: {parseFloat(site.latitude).toFixed(4)}°,{' '}
                  {parseFloat(site.longitude).toFixed(4)}°
                </div>
              </div>

              {/* Description */}
              {site.description && (
                <div>
                  <h3 className="font-semibold mb-2">Site Description</h3>
                  <p className="text-sm text-muted-foreground">{site.description}</p>
                </div>
              )}

              {/* Landing information */}
              {site.landingLat && site.landingLng && site.landingDescription && (
                <div>
                  <h3 className="font-semibold mb-2">Landing Information</h3>
                  <p className="text-sm text-muted-foreground">{site.landingDescription}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Landing: {parseFloat(site.landingLat).toFixed(4)}°,{' '}
                    {parseFloat(site.landingLng).toFixed(4)}°
                  </p>
                </div>
              )}

              {/* Map */}
              <div>
                <h3 className="text-sm font-medium mb-2">Location Map</h3>
                <MapDisplayWrapper
                  latitude={parseFloat(site.latitude)}
                  longitude={parseFloat(site.longitude)}
                />
              </div>

              {/* Source attribution - subtle */}
              <p className="text-xs text-muted-foreground">
                Data source:{' '}
                {site.source === 'paraglidingearth' ? 'ParaglidingEarth.com' : site.source}
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
