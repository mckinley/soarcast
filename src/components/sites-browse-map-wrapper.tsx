import { lazy, Suspense, useState, useEffect } from 'react';
import type { SitesBrowseMapProps } from '@/components/sites-browse-map';

const SitesBrowseMap = lazy(() =>
  // Never rendered on the server: leaving the import out of the server build
  // keeps Leaflet and MapLibre (about 2 MB) out of the Worker.
  import.meta.env.SSR
    ? new Promise<never>(() => {})
    : import('@/components/sites-browse-map').then((mod) => ({ default: mod.SitesBrowseMap })),
);

const SKELETON = (
  <div className="h-full w-full rounded-md border bg-muted animate-pulse flex items-center justify-center">
    <p className="text-sm text-muted-foreground">Loading map...</p>
  </div>
);

export function SitesBrowseMapWrapper({ sites, onBoundsChange, fitBounds }: SitesBrowseMapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return SKELETON;

  return (
    <Suspense fallback={SKELETON}>
      <SitesBrowseMap sites={sites} onBoundsChange={onBoundsChange} fitBounds={fitBounds} />
    </Suspense>
  );
}
