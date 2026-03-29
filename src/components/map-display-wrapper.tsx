import { lazy, Suspense, useState, useEffect } from 'react';

const MapDisplay = lazy(() =>
  import('@/components/map-display').then((mod) => ({ default: mod.MapDisplay })),
);

export function MapDisplayWrapper({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="h-[300px] rounded-md border bg-muted animate-pulse flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="h-[300px] rounded-md border bg-muted animate-pulse flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      }
    >
      <MapDisplay latitude={latitude} longitude={longitude} />
    </Suspense>
  );
}
