import { lazy, Suspense, useEffect, useState } from 'react';
import type { PlanningMapProps } from '@/components/planning-map';

const PlanningMap = lazy(() =>
  // Never rendered on the server: leaving the import out of the server build
  // keeps Leaflet and MapLibre (about 2 MB) out of the Worker.
  import.meta.env.SSR
    ? new Promise<never>(() => {})
    : import('@/components/planning-map').then((mod) => ({ default: mod.PlanningMap })),
);

const SKELETON = (
  <div className="flex h-full w-full items-center justify-center rounded-md border bg-muted animate-pulse">
    <p className="text-sm text-muted-foreground">Loading map...</p>
  </div>
);

export function PlanningMapWrapper(props: PlanningMapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return SKELETON;

  return (
    <Suspense fallback={SKELETON}>
      <PlanningMap {...props} />
    </Suspense>
  );
}
