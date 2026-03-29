import { lazy, Suspense, useState, useEffect } from 'react';
import type { LaunchSite } from '@/db/schema';

const SitesBrowseMap = lazy(() =>
  import('@/components/sites-browse-map').then((mod) => ({ default: mod.SitesBrowseMap })),
);

export function SitesBrowseMapWrapper({ sites }: { sites: LaunchSite[] }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="h-[500px] rounded-md border bg-muted animate-pulse flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="h-[500px] rounded-md border bg-muted animate-pulse flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      }
    >
      <SitesBrowseMap sites={sites} />
    </Suspense>
  );
}
