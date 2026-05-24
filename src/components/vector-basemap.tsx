import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import maplibregl from 'maplibre-gl';
import '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAPS_BASEMAP_STYLE } from '@/lib/basemap';

// The @maplibre/maplibre-gl-leaflet plugin reads `maplibregl` off the global in
// some builds; set it explicitly so `L.maplibreGL` is wired regardless of the
// plugin version. (These map components are React.lazy/client-only, so this
// runs in the browser only.)
(globalThis as unknown as { maplibregl?: typeof maplibregl }).maplibregl =
  maplibregl;

const ATTRIBUTION =
  '© <a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>';

/**
 * Renders the shared maps service's Protomaps vector basemap as a Leaflet
 * layer. Leaflet's raster <TileLayer> can't render vector (MVT) tiles, so this
 * bridges a MapLibre GL canvas into Leaflet via @maplibre/maplibre-gl-leaflet.
 * Drop-in replacement for <TileLayer> as the first child of a <MapContainer>
 * (renders below marker/cluster layers).
 */
export function VectorBasemap({ style = MAPS_BASEMAP_STYLE }: { style?: string }) {
  const map = useMap();

  useEffect(() => {
    const layer = (
      L as unknown as {
        maplibreGL(opts: { style: string; attribution?: string }): L.Layer;
      }
    ).maplibreGL({ style, attribution: ATTRIBUTION });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, style]);

  return null;
}
