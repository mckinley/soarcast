import { LayersControl, TileLayer } from 'react-leaflet';
import { KK7_ATTRIBUTION } from '@/components/data-credits';

const KK7_TILES = 'https://thermal.kk7.ch/tiles';

/**
 * kk7's thermal maps as map layers the pilot can switch on: where millions of
 * flight tracks (XContest and others) found thermals, and the skyways between
 * them. kk7 asks every tile request to name the site in `src`; its tiles are
 * in TMS order. Drawn in the overlay pane, above the MapLibre basemap and
 * below markers.
 */
export function ThermalOverlays({ hotspotsOn = false }: { hotspotsOn?: boolean }) {
  const src = typeof window === 'undefined' ? 'soarcast' : window.location.hostname;
  return (
    <LayersControl position="topright">
      <LayersControl.Overlay name="Thermal hotspots" checked={hotspotsOn}>
        <TileLayer
          url={`${KK7_TILES}/thermals_all_all/{z}/{x}/{y}.png?src=${src}`}
          tms
          maxNativeZoom={12}
          opacity={0.75}
          pane="overlayPane"
          attribution={KK7_ATTRIBUTION}
        />
      </LayersControl.Overlay>
      <LayersControl.Overlay name="Skyways">
        <TileLayer
          url={`${KK7_TILES}/skyways_all_all/{z}/{x}/{y}.png?src=${src}`}
          tms
          maxNativeZoom={13}
          opacity={0.75}
          pane="overlayPane"
          attribution={KK7_ATTRIBUTION}
        />
      </LayersControl.Overlay>
    </LayersControl>
  );
}
