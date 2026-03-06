import { XMLParser } from 'fast-xml-parser';
import { launchSites, type NewLaunchSite } from '@/db/schema';

const PARAGLIDINGEARTH_API = 'https://www.paragliding.earth/api/getBoundingBoxSites.php';

interface ParaglidingEarthSite {
  name: string;
  lat: string;
  lng: string;
  takeoff_altitude?: string;
  landing_altitude?: string;
  orientations?: {
    N?: number;
    NE?: number;
    E?: number;
    SE?: number;
    S?: number;
    SW?: number;
    W?: number;
    NW?: number;
  };
  paragliding?: number;
  hanggliding?: number;
  country?: string;
  region?: string;
  description?: string;
  landing_lat?: string;
  landing_lng?: string;
  landing_description?: string;
}

interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Convert a site name to a URL-friendly slug
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Trim leading/trailing hyphens
}

/**
 * Convert orientation ratings to ideal wind directions array
 * Directions rated 2 (good) become ideal wind directions (in degrees)
 */
export function orientationsToIdealDirections(
  orientations: Record<string, number> | undefined,
): number[] {
  if (!orientations) return [];

  const directionMap: Record<string, number> = {
    N: 0,
    NE: 45,
    E: 90,
    SE: 135,
    S: 180,
    SW: 225,
    W: 270,
    NW: 315,
  };

  const idealDirections: number[] = [];

  for (const [direction, rating] of Object.entries(orientations)) {
    if (rating === 2 && direction in directionMap) {
      idealDirections.push(directionMap[direction]);
    }
  }

  return idealDirections.sort((a, b) => a - b);
}

/**
 * Fetch sites from ParaglidingEarth API for a given bounding box
 */
export async function fetchParaglidingEarthSites(
  bbox: BoundingBox,
): Promise<ParaglidingEarthSite[]> {
  const url = new URL(PARAGLIDINGEARTH_API);
  url.searchParams.set('north', bbox.north.toString());
  url.searchParams.set('south', bbox.south.toString());
  url.searchParams.set('east', bbox.east.toString());
  url.searchParams.set('west', bbox.west.toString());
  url.searchParams.set('limit', '100');
  url.searchParams.set('style', 'detailled');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`ParaglidingEarth API error: ${response.status} ${response.statusText}`);
  }

  const xmlText = await response.text();

  // Parse XML
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
  });

  const parsed = parser.parse(xmlText);

  // Extract takeoff sites from parsed XML
  const sites: ParaglidingEarthSite[] = [];

  if (parsed.search && parsed.search.takeoff) {
    const takeoffs = Array.isArray(parsed.search.takeoff)
      ? parsed.search.takeoff
      : [parsed.search.takeoff];

    for (const takeoff of takeoffs) {
      sites.push({
        name: takeoff.name || 'Unnamed Site',
        lat: takeoff.lat?.toString() || '0',
        lng: takeoff.lng?.toString() || '0',
        takeoff_altitude: takeoff.takeoff_altitude?.toString(),
        landing_altitude: takeoff.landing_altitude?.toString(),
        orientations: takeoff.orientations,
        paragliding: takeoff.paragliding,
        hanggliding: takeoff.hanggliding,
        country: takeoff.country,
        region: takeoff.region,
        description: takeoff.description,
        landing_lat: takeoff.landing_lat?.toString(),
        landing_lng: takeoff.landing_lng?.toString(),
        landing_description: takeoff.landing_description,
      });
    }
  }

  return sites;
}

/**
 * Map ParaglidingEarth site data to our launch_sites schema
 */
export function mapParaglidingEarthSite(site: ParaglidingEarthSite): NewLaunchSite {
  const flyingTypes: string[] = [];
  if (site.paragliding === 1) flyingTypes.push('paragliding');
  if (site.hanggliding === 1) flyingTypes.push('hanggliding');

  const idealDirections = orientationsToIdealDirections(site.orientations);

  // Generate unique source ID from coordinates (ParaglidingEarth doesn't provide stable IDs)
  const sourceId = `${site.lat}_${site.lng}`;

  return {
    name: site.name,
    slug: generateSlug(site.name),
    countryCode: site.country || null,
    region: site.region || null,
    latitude: site.lat,
    longitude: site.lng,
    elevation: site.takeoff_altitude ? parseInt(site.takeoff_altitude, 10) : null,
    landingElevation: site.landing_altitude ? parseInt(site.landing_altitude, 10) : null,
    orientations: site.orientations || null,
    siteType: 'takeoff',
    flyingTypes: flyingTypes.length > 0 ? flyingTypes : null,
    source: 'paraglidingearth',
    sourceId,
    description: site.description || null,
    landingLat: site.landing_lat || null,
    landingLng: site.landing_lng || null,
    landingDescription: site.landing_description || null,
    maxWindSpeed: null, // Not provided by ParaglidingEarth
    idealWindDirections: idealDirections.length > 0 ? idealDirections : null,
    lastSyncedAt: new Date(),
  };
}

/**
 * Import sites into the database with upsert (avoids duplicates on re-import)
 */
export async function importSites(sites: ParaglidingEarthSite[]): Promise<number> {
  // Import db lazily to avoid requiring env vars at module load time
  const { db } = await import('@/db');

  let imported = 0;

  for (const site of sites) {
    const mappedSite = mapParaglidingEarthSite(site);

    // Upsert based on source + sourceId
    await db
      .insert(launchSites)
      .values(mappedSite)
      .onConflictDoUpdate({
        target: [launchSites.sourceId],
        set: {
          ...mappedSite,
          updatedAt: new Date(),
        },
      });

    imported++;
  }

  return imported;
}

/**
 * Fetch and import sites with rate limiting
 */
export async function scrapeAndImport(
  bbox: BoundingBox,
  rateLimitMs = 1000,
): Promise<{ fetched: number; imported: number }> {
  // Rate limit: wait before making request
  await new Promise((resolve) => setTimeout(resolve, rateLimitMs));

  const sites = await fetchParaglidingEarthSites(bbox);
  const imported = await importSites(sites);

  return {
    fetched: sites.length,
    imported,
  };
}
