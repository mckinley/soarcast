import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { Icon } from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Link } from 'react-router';
import type { BrowseSite } from '@/components/sites-browse-client';
import { getOrientations } from '@/lib/site-utils';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

const markerIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface SitesBrowseMapProps {
  sites: BrowseSite[];
  onBoundsChange?: (lat: number, lng: number, radiusKm: number, zoom: number) => void;
  fitBounds?: boolean;
}

/** Fires onBoundsChange on map move and on initial load. */
function BoundsChangeHandler({
  onBoundsChange,
}: {
  onBoundsChange: (lat: number, lng: number, radiusKm: number, zoom: number) => void;
}) {
  const map = useMapEvents({
    moveend: emit,
    zoomend: emit,
  });

  function emit() {
    const center = map.getCenter();
    const ne = map.getBounds().getNorthEast();
    const radiusKm = Math.ceil(center.distanceTo(ne) / 1000);
    onBoundsChange(center.lat, center.lng, radiusKm, map.getZoom());
  }

  // Fire once after the map is ready so the initial view loads sites.
  useEffect(() => {
    const timer = setTimeout(emit, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** Fits the map to show all markers whenever `sites` changes (search results). */
function FitBoundsOnChange({ sites }: { sites: BrowseSite[] }) {
  const map = useMap();

  useEffect(() => {
    if (sites.length > 0) {
      map.fitBounds(
        sites.map((s) => [s.latitude, s.longitude] as [number, number]),
        { padding: [40, 40], maxZoom: 12 },
      );
    }
  }, [sites, map]);

  return null;
}

export function SitesBrowseMap({ sites, onBoundsChange, fitBounds = false }: SitesBrowseMapProps) {
  return (
    <MapContainer
      center={[20, 10]}
      zoom={3}
      scrollWheelZoom={true}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {onBoundsChange && <BoundsChangeHandler onBoundsChange={onBoundsChange} />}
      {fitBounds && <FitBoundsOnChange sites={sites} />}

      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={60}
        spiderfyOnMaxZoom={true}
        showCoverageOnHover={false}
        zoomToBoundsOnClick={true}
      >
        {sites.map((site) => {
          const orientations = getOrientations(site);
          const activeOrientations = Object.entries(orientations)
            .filter(([, r]) => r >= 1)
            .map(([dir]) => dir);

          return (
            <Marker
              key={site.id}
              position={[site.latitude, site.longitude]}
              icon={markerIcon}
            >
              <Popup>
                <div className="space-y-1.5 min-w-[160px]">
                  <p className="font-semibold leading-tight">{site.name}</p>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {site.altitude && <p>{site.altitude}m elevation</p>}
                    {site.countryCode && <p>{site.countryCode}</p>}
                    {activeOrientations.length > 0 && (
                      <p>Wind: {activeOrientations.join(', ')}</p>
                    )}
                  </div>
                  <Link
                    to={`/sites/${site.slug}`}
                    className="inline-block text-xs text-blue-600 hover:underline dark:text-blue-400 pt-1"
                  >
                    View site →
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
