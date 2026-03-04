import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getSites } from '../actions';
import { getForecast } from '@/lib/weather';
import { calculateDailyScores } from '@/lib/scoring';
import { SiteDetailClient } from '@/components/site-detail-client';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Dynamically import map display (Leaflet requires window/document)
const MapDisplay = dynamic(
  () => import('@/components/map-display').then((mod) => mod.MapDisplay),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] rounded-md border bg-muted animate-pulse flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    ),
  }
);

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sites = await getSites();
  const site = sites.find((s) => s.id === id);

  if (!site) {
    notFound();
  }

  // Fetch forecast for this site
  let forecast = null;
  let scores = null;
  let error = null;

  try {
    forecast = await getForecast(site.id, site.latitude, site.longitude);
    if (forecast) {
      scores = calculateDailyScores(forecast, site);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to fetch forecast';
  }

  return (
    <div className="space-y-6">
      {/* Header with back navigation */}
      <div>
        <Link href="/sites">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sites
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">{site.name}</h1>
        <div className="mt-2 text-sm text-muted-foreground space-y-1">
          <p>
            Location: {site.latitude.toFixed(4)}°, {site.longitude.toFixed(4)}°
          </p>
          <p>Elevation: {site.elevation}m</p>
          {site.idealWindDirections.length > 0 && (
            <p>
              Ideal Wind Directions:{' '}
              {site.idealWindDirections.map((d) => `${d}°`).join(', ')}
            </p>
          )}
          <p>Max Wind Speed: {site.maxWindSpeed} km/h</p>
          {site.notes && <p className="italic">{site.notes}</p>}
        </div>

        {/* Site location map */}
        <div className="mt-4">
          <MapDisplay latitude={site.latitude} longitude={site.longitude} />
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
        <SiteDetailClient site={site} forecast={forecast} scores={scores} />
      )}
    </div>
  );
}
