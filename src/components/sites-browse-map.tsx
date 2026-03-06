'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import Link from 'next/link';
import type { LaunchSite } from '@/db/schema';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon in Next.js
const markerIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface SitesBrowseMapProps {
  sites: LaunchSite[];
}

// Component to handle map bounds updates when sites change
function MapBoundsUpdater({ sites }: { sites: LaunchSite[] }) {
  const map = useMap();

  useEffect(() => {
    if (sites.length > 0) {
      const bounds = sites.map(
        (site) => [parseFloat(site.latitude), parseFloat(site.longitude)] as [number, number],
      );

      // Fit map to show all markers
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [sites, map]);

  return null;
}

export function SitesBrowseMap({ sites }: SitesBrowseMapProps) {
  // Calculate center from sites (Washington State default if no sites)
  const center: [number, number] =
    sites.length > 0
      ? [
          sites.reduce((sum, s) => sum + parseFloat(s.latitude), 0) / sites.length,
          sites.reduce((sum, s) => sum + parseFloat(s.longitude), 0) / sites.length,
        ]
      : [47.5, -120.5]; // Washington State center

  return (
    <div className="h-[500px] rounded-md overflow-hidden border">
      <MapContainer
        center={center}
        zoom={sites.length > 0 ? 7 : 7}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBoundsUpdater sites={sites} />

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={60}
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          zoomToBoundsOnClick={true}
        >
          {sites.map((site) => {
            const position: [number, number] = [
              parseFloat(site.latitude),
              parseFloat(site.longitude),
            ];

            return (
              <Marker key={site.id} position={position} icon={markerIcon}>
                <Popup>
                  <div className="space-y-2">
                    <h3 className="font-semibold">{site.name}</h3>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {site.elevation && <p>Elevation: {site.elevation}m</p>}
                      {site.region && <p>Region: {site.region}</p>}
                      {site.orientations && (
                        <p>
                          Orientations:{' '}
                          {Object.entries(site.orientations)
                            .filter(([, rating]) => rating >= 1)
                            .map(([dir]) => dir)
                            .join(', ')}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/sites/${site.slug}`}
                      className="inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                      View Details →
                    </Link>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
