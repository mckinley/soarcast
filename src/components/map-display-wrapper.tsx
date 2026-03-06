'use client';

import dynamic from 'next/dynamic';

const MapDisplay = dynamic(() => import('@/components/map-display').then((mod) => mod.MapDisplay), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] rounded-md border bg-muted animate-pulse flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading map...</p>
    </div>
  ),
});

export function MapDisplayWrapper({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  return <MapDisplay latitude={latitude} longitude={longitude} />;
}
