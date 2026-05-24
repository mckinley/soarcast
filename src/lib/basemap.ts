/**
 * Shared maps service basemap — self-hosted Protomaps vector tiles served by
 * maps.mckinleyaviation.com. Replaces raw OpenStreetMap raster tiles, which
 * aren't licensed for production traffic. Attribution is provided by the
 * served style.json (and the bridge layer, see vector-basemap.tsx).
 */
export const MAPS_BASEMAP_STYLE =
  "https://maps.mckinleyaviation.com/styles/light.json";
