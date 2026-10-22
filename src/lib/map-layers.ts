// The layers a pilot can switch on over SoarCast's maps
// (src/components/map-layers.tsx): kk7's thermal maps by season and time of
// day, and rain, clouds and lightning now from free sources. Every source
// here allows a browser to read it directly (CORS), so the map asks them
// itself. Airspace is the one layer that goes through SoarCast's Worker
// (app/routes/api.airspace.$z.$x.$y.ts), as openAIP's key must stay secret.
// None of these layers changes a verdict.

// --- kk7 thermal maps -------------------------------------------------------

export const KK7_TILES = 'https://thermal.kk7.ch/tiles';

/** kk7's times of year: three months around the named one. */
export const KK7_SEASONS = [
  { id: 'all', label: 'All year' },
  { id: 'jan', label: 'Dec to Feb' },
  { id: 'apr', label: 'Mar to May' },
  { id: 'jul', label: 'Jun to Aug' },
  { id: 'oct', label: 'Sep to Nov' },
] as const;

/** kk7's times of day, counted from sunrise. */
export const KK7_TIMES = [
  { id: 'all', label: 'All day' },
  { id: '04', label: 'Morning' },
  { id: '07', label: 'Midday' },
  { id: '10', label: 'Late' },
] as const;

export type Kk7Season = (typeof KK7_SEASONS)[number]['id'];
export type Kk7Time = (typeof KK7_TIMES)[number]['id'];

/** Hours after sunrise where kk7's morning ends and its late part starts. */
export const KK7_MORNING_HOURS = 6;
export const KK7_LATE_HOURS = 10;

/** A kk7 tile URL. kk7 asks every request to name the site in `src`. */
export function kk7TileUrl(
  kind: 'thermals' | 'skyways',
  season: Kk7Season,
  time: Kk7Time,
  src: string,
): string {
  return `${KK7_TILES}/${kind}_${season}_${time}/{z}/{x}/{y}.png?src=${encodeURIComponent(src)}`;
}

/** The kk7 time of year a month (1 to 12) falls in. */
export function kk7SeasonOf(month: number): Kk7Season {
  return (
    ['jan', 'jan', 'apr', 'apr', 'apr', 'jul', 'jul', 'jul', 'oct', 'oct', 'oct', 'jan'] as const
  )[(((month - 1) % 12) + 12) % 12];
}

// --- Rain now: RainViewer radar ----------------------------------------------

export const RAINVIEWER_MAPS = 'https://api.rainviewer.com/public/weather-maps.json';
/** RainViewer's free tiles stop at this zoom; the map enlarges them beyond it. */
export const RAINVIEWER_MAX_ZOOM = 7;

interface RainViewerMaps {
  host?: string;
  radar?: { past?: { time: number; path: string }[] };
}

/** The newest radar picture's tile URL and time (ms), from RainViewer's list. */
export function newestRain(maps: RainViewerMaps): { url: string; at: number } | null {
  const frames = maps.radar?.past ?? [];
  const last = frames[frames.length - 1];
  if (!maps.host || !last) return null;
  // 256 px tiles, colour scheme 2 (the free one), smoothed, no separate snow colours
  return { url: `${maps.host}${last.path}/256/{z}/{x}/{y}/2/1_0.png`, at: last.time * 1000 };
}

// --- Clouds now: weather satellites -----------------------------------------

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const EUMETVIEW = 'https://view.eumetsat.int/geoserver';

/** One satellite picture: NASA's GIBS tiles or a EUMETSAT map service. */
export type Imagery =
  | { kind: 'gibs'; layer: string; matrixSet: string; maxNativeZoom: number }
  | { kind: 'wms'; root: string; workspace: string; layer: string; maxNativeZoom: number };

export interface CloudSatellite {
  id: string;
  /** What the map says the picture comes from */
  name: string;
  credit: 'nasa' | 'eumetsat';
  /** The longitudes this satellite covers best, west edge included */
  west: number;
  east: number;
  /** Visible light: clouds as the eye sees them, by day only */
  day: Imagery;
  /** Infrared: cloud tops by their cold, day and night */
  night: Imagery;
}

const gibs = (layer: string, level: number): Imagery => ({
  kind: 'gibs',
  layer,
  matrixSet: `GoogleMapsCompatible_Level${level}`,
  maxNativeZoom: level,
});
const eumet = (workspace: string, layer: string): Imagery => ({
  kind: 'wms',
  root: EUMETVIEW,
  workspace,
  layer,
  maxNativeZoom: 10,
});

/** Geostationary satellites around the world, west to east. */
export const CLOUD_SATELLITES: CloudSatellite[] = [
  {
    id: 'goes-west',
    name: 'GOES-West',
    credit: 'nasa',
    west: -180,
    east: -112,
    day: gibs('GOES-West_ABI_Band2_Red_Visible_1km', 7),
    night: gibs('GOES-West_ABI_Band13_Clean_Infrared', 6),
  },
  {
    id: 'goes-east',
    name: 'GOES-East',
    credit: 'nasa',
    west: -112,
    east: -45,
    day: gibs('GOES-East_ABI_Band2_Red_Visible_1km', 7),
    night: gibs('GOES-East_ABI_Band13_Clean_Infrared', 6),
  },
  {
    id: 'meteosat',
    name: 'Meteosat',
    credit: 'eumetsat',
    west: -45,
    east: 65,
    day: eumet('mtg_fd', 'vis06_hrfi'),
    night: eumet('mtg_fd', 'ir105_hrfi'),
  },
  {
    id: 'meteosat-indian-ocean',
    name: 'Meteosat',
    credit: 'eumetsat',
    west: 65,
    east: 110,
    day: eumet('msg_iodc', 'vis006'),
    night: eumet('msg_iodc', 'ir108'),
  },
  {
    id: 'himawari',
    name: 'Himawari',
    credit: 'nasa',
    west: 110,
    east: 180,
    day: gibs('Himawari_AHI_Band3_Red_Visible_1km', 7),
    night: gibs('Himawari_AHI_Band13_Clean_Infrared', 6),
  },
];

/** Longitude folded into -180 to 180. */
export function wrapLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** The satellite that sees a longitude best. */
export function cloudSatelliteAt(lon: number): CloudSatellite {
  const x = wrapLongitude(lon);
  return CLOUD_SATELLITES.find((s) => x >= s.west && x < s.east) ?? CLOUD_SATELLITES[0];
}

const RAD = Math.PI / 180;

/** The sun's height above the horizon (degrees) at a place and time. */
export function sunElevation(lat: number, lon: number, ms: number): number {
  const days = ms / 864e5 - 10957.5; // days since 2000-01-01 12:00 UTC
  const meanLon = (280.46 + 0.9856474 * days) % 360;
  const anomaly = ((357.528 + 0.9856003 * days) % 360) * RAD;
  const eclipticLon = (meanLon + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * days) * RAD;
  const decl = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon));
  const ra = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLon), Math.cos(eclipticLon));
  const sidereal = (280.46061837 + 360.98564736629 * days + lon) * RAD;
  const hourAngle = sidereal - ra;
  const sinAlt =
    Math.sin(lat * RAD) * Math.sin(decl) +
    Math.cos(lat * RAD) * Math.cos(decl) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
}

/** Visible light needs the sun well up; below this the infrared picture shows. */
export const VISIBLE_MIN_SUN_DEGREES = 5;

/** Which of a satellite's pictures suits a place now. */
export function cloudImageryAt(
  lat: number,
  lon: number,
  ms: number,
): { satellite: CloudSatellite; imagery: Imagery; visible: boolean } {
  const satellite = cloudSatelliteAt(lon);
  const visible = sunElevation(lat, lon, ms) >= VISIBLE_MIN_SUN_DEGREES;
  return { satellite, imagery: visible ? satellite.day : satellite.night, visible };
}

/** A GIBS tile URL for one picture time. GIBS orders rows before columns. */
export function gibsTileUrl(imagery: Extract<Imagery, { kind: 'gibs' }>, time: string): string {
  return `${GIBS}/${imagery.layer}/default/${time}/${imagery.matrixSet}/{z}/{y}/{x}.png`;
}

/** Where to ask for a GIBS picture's newest time: its header on a world tile says it. */
export function gibsProbeUrl(imagery: Extract<Imagery, { kind: 'gibs' }>): string {
  return `${GIBS}/${imagery.layer}/default/default/${imagery.matrixSet}/0/0/0.png`;
}

// --- Lightning now ------------------------------------------------------------

export interface LightningSource {
  id: string;
  credit: 'noaa' | 'eumetsat';
  /** The GeoServer, and the workspace and layer on it */
  root: string;
  workspace: string;
  layer: string;
  /** Where its lightning counts */
  covers: (lat: number, lon: number) => boolean;
}

export const LIGHTNING_SOURCES: LightningSource[] = [
  {
    // Lightning networks on the ground (NLDN, GLD360), mapped by NOAA every 15 minutes
    id: 'noaa',
    credit: 'noaa',
    root: 'https://nowcoast.noaa.gov/geoserver',
    workspace: 'lightning_detection',
    layer: 'ldn_lightning_strike_density',
    covers: (lat, lon) =>
      lat >= -25 && lat <= 80 && (wrapLongitude(lon) <= 0 || wrapLongitude(lon) >= 110),
  },
  {
    // The lightning camera on Meteosat's newest satellite, every 5 minutes
    id: 'meteosat',
    credit: 'eumetsat',
    root: EUMETVIEW,
    workspace: 'mtg_fd',
    layer: 'li_afa',
    covers: (lat, lon) => Math.abs(lat) <= 70 && Math.abs(wrapLongitude(lon)) <= 70,
  },
];

/** The lightning sources that cover a place. */
export function lightningSourcesAt(lat: number, lon: number): LightningSource[] {
  return LIGHTNING_SOURCES.filter((s) => s.covers(lat, lon));
}

// --- Picture times -------------------------------------------------------------

/** How often (minutes) a "now" layer looks for a newer picture while on. */
export const MAP_NOW_REFRESH_MINUTES = 5;

/** One layer's capabilities on a GeoServer (`root` is the server, before any workspace), which name its newest time. */
export function layerCapabilitiesUrl(root: string, workspace: string, layer: string): string {
  return `${root}/${workspace}/${layer}/ows?service=WMS&version=1.3.0&request=GetCapabilities`;
}

/** A GeoServer workspace's map service, where `layers` names a layer in it. */
export function workspaceWmsUrl(root: string, workspace: string): string {
  return `${root}/${workspace}/wms`;
}

/** The newest time a layer's capabilities offer, in ms, or null. */
export function newestWmsTime(capabilities: string): number | null {
  const m = capabilities.match(/<Dimension name="time" default="([^"]+)"/);
  const t = m ? Date.parse(m[1]) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** "12 min ago", "1 h 5 min ago": how old a picture is. */
export function ageText(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h ago` : `${h} h ${m} min ago`;
}

// --- Airspace: openAIP ---------------------------------------------------------

/** openAIP draws its tiles from this zoom; SoarCast stops asking past the max. */
export const AIRSPACE_MIN_ZOOM = 4;
export const AIRSPACE_MAX_ZOOM = 14;

/** openAIP's own tile, which needs SoarCast's key (app/routes/api.airspace.$z.$x.$y.tsx). */
export function openAipTileUrl(z: number, x: number, y: number): string {
  return `https://api.tiles.openaip.net/api/data/openaip/${z}/${x}/${y}.png`;
}
