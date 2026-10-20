import { Circle, CircleMarker, MapContainer, Popup, Tooltip, useMap } from 'react-leaflet';
import { Link } from 'react-router';
import { useEffect } from 'react';
import { VectorBasemap } from '@/components/vector-basemap';
import 'leaflet/dist/leaflet.css';

/** A flying area or launch on the Planning map. */
export interface PlanningMapPoint {
  key: string;
  name: string;
  /** Where it opens; null for a launch not rated yet */
  href: string | null;
  latitude: number;
  longitude: number;
  /** Go share over the window, 0-1; null before it's rated */
  share: number | null;
  detail: string;
}

export interface PlanningMapProps {
  points: PlanningMapPoint[];
  /** Middles of the areas shown, drawn with their reach */
  extents: Array<{ key: string; latitude: number; longitude: number }>;
  radiusKm: number;
}

/** The same steps as the grid's cells, as fills a basemap can carry. */
function shareFill(share: number): string {
  if (share >= 0.5) return '#15803d';
  if (share >= 0.3) return '#4ade80';
  if (share >= 0.15) return '#86efac';
  if (share > 0) return '#dcfce7';
  return '#e5e7eb';
}

/** Fits the map to the points whenever they change. */
function FitPoints({ points }: { points: PlanningMapPoint[] }) {
  const map = useMap();
  const signature = points.map((p) => p.key).join(',');
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(
      points.map((p) => [p.latitude, p.longitude] as [number, number]),
      { padding: [24, 24], maxZoom: 8 },
    );
  }, [signature, map]);
  return null;
}

export function PlanningMap({ points, extents, radiusKm }: PlanningMapProps) {
  return (
    <MapContainer
      center={[25, 10]}
      zoom={1}
      minZoom={0}
      zoomSnap={0.25}
      maxZoom={12}
      worldCopyJump
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <VectorBasemap />
      <FitPoints points={points} />
      {extents.map((e) => (
        <Circle
          key={e.key}
          center={[e.latitude, e.longitude]}
          radius={radiusKm * 1000}
          pathOptions={{ color: '#64748b', weight: 1, dashArray: '4 4', fill: false }}
          interactive={false}
        />
      ))}
      {points.map((p) => (
        <CircleMarker
          key={p.key}
          center={[p.latitude, p.longitude]}
          radius={9}
          pathOptions={
            p.share == null
              ? {
                  color: '#64748b',
                  weight: 2,
                  dashArray: '3 3',
                  fillColor: '#ffffff',
                  fillOpacity: 0.7,
                }
              : { color: '#ffffff', weight: 2, fillColor: shareFill(p.share), fillOpacity: 1 }
          }
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <span className="font-medium">{p.name}</span>
            {p.share != null ? ` · ${Math.round(p.share * 100)}%` : ' · not rated yet'}
          </Tooltip>
          <Popup>
            <div className="min-w-[150px] space-y-1">
              <p className="font-semibold leading-tight">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.detail}</p>
              <p className="text-xs">
                {p.share != null
                  ? `A go on ${Math.round(p.share * 100)}% of days`
                  : 'Not rated yet: its last two years arrive within a day.'}
              </p>
              {p.href && (
                <Link
                  to={p.href}
                  className="inline-block pt-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Open →
                </Link>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
