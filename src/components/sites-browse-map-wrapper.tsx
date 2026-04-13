import { lazy, Suspense, useState, useEffect } from 'react';
import type { BrowseSite } from '@/components/sites-browse-client';
import type { SitesBrowseMapProps } from '@/components/sites-browse-map';

const SitesBrowseMap = lazy(() =>
  import('@/components/sites-browse-map').then((mod) => ({ default: mod.SitesBrowseMap })),
);

const SKELETON = (
  <div className="h-full w-full rounded-md border bg-muted animate-pulse flex items-center justify-center">
    <p className="text-sm text-muted-foreground">Loading map...</p>
  </div>
);

export function SitesBrowseMapWrapper({
  sites,
  onBoundsChange,
  fitBounds,
}: SitesBrowseMapProps) {
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
