import type { PgsitesSyncRun } from './health';

const BASE_URL = 'https://pgsites.mckinleyaviation.com';

/** Where pgsites got a site (PgSite.source). 'pilot': a private site its pilot shared. */
export type SiteOrigin = 'pge' | 'flown' | 'osm' | 'pilot';

/** A site's origin, reading anything unknown (or an older answer) as Paragliding Earth. */
export function siteOrigin(source: string | null | undefined): SiteOrigin {
  return source === 'flown' || source === 'osm' || source === 'pilot' ? source : 'pge';
}

export interface PgSite {
  id: string;
  pge_site_id: number;
  name: string;
  country_code: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  landing_altitude: number | null;
  landing_latitude: number | null;
  landing_longitude: number | null;
  wind_n: number;
  wind_ne: number;
  wind_e: number;
  wind_se: number;
  wind_s: number;
  wind_sw: number;
  wind_w: number;
  wind_nw: number;
  is_paragliding: number;
  is_hanggliding: number;
  /** What the site gives, as tagged on Paragliding Earth. /api/sites/:id and /api/sites/near return these, search does not. */
  is_thermal?: number;
  is_soaring?: number;
  is_xc?: number;
  is_hike?: number;
  description: string;
  pge_link: string;
  created_at: number;
  updated_at: number;
  /**
   * Pilots Syncing Pilots tracked taking off within 2 km in the last year,
   * the days they flew and the last of them (YYYY-MM-DD). Null when none.
   * Search, near and the minimal list return these.
   */
  flown_pilots?: number | null;
  flown_days?: number | null;
  flown_last?: string | null;
  /**
   * 'pge' for a Paragliding Earth site. 'flown' for a busy launch no listed
   * site covered, found from flights Syncing Pilots tracked: its name comes
   * from OpenStreetMap and its wind directions are the directions pilots flew
   * off launch. 'osm' for a takeoff mapped in OpenStreetMap that no listed
   * site covered, with the directions mapped there. Neither has a Paragliding
   * Earth page (empty pge_link).
   */
  source?: SiteOrigin;
  /** An 'osm' site's page on openstreetmap.org. Null otherwise. */
  source_url?: string | null;
  /** Where tracked pilots really launch near the site, when they do. Null when none. */
  launch_latitude?: number | null;
  launch_longitude?: number | null;
  launch_altitude?: number | null;
  /**
   * The ground within 20 km: its average steepness (degrees) and the height
   * it spans (m). Null until pgsites has measured it (src/lib/site-terrain.ts).
   */
  terrain_slope?: number | null;
  terrain_relief?: number | null;
}

/** A place pgsites' search found by name ("Cali"), with the listed sites near it, busiest first. */
export interface PgPlace {
  name: string;
  /** State or province */
  region: string | null;
  country_code: string;
  latitude: number;
  longitude: number;
  sites: Array<PgSite & { distance_km: number }>;
}

/**
 * How long a pgsites answer is reused. Sites change at most daily and comps
 * weekly, and a pgsites call can take a second when its Worker starts fresh.
 */
export const PGSITES_CACHE_SECONDS = 6 * 60 * 60;

/** The Worker's cache in this data center; none in Node (scripts, tests). */
function edgeCache(): Cache | null {
  return typeof caches === 'undefined'
    ? null
    : ((caches as unknown as { default?: Cache }).default ?? null);
}

async function fetchApi<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string | number>,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  // Cached by URL alone: every caller uses SoarCast's one key
  const cache = fresh ? null : edgeCache();
  const cacheKey = new Request(url.toString());
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit.json() as Promise<T>;

  const response = await fetch(url.toString(), {
    headers: { 'X-API-Key': apiKey },
  });

  if (!response.ok) {
    throw new Error(`pgsites API error: ${response.status} ${response.statusText} for ${path}`);
  }

  const body = await response.text();
  if (cache) {
    const copy = new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${PGSITES_CACHE_SECONDS}`,
      },
    });
    await cache.put(cacheKey, copy).catch(() => undefined);
  }
  return JSON.parse(body) as T;
}

export async function searchSites(
  apiKey: string,
  query: string,
  limit?: number,
  options?: { fresh?: boolean },
): Promise<PgSite[]> {
  const params: Record<string, string | number> = { q: query };
  if (limit !== undefined) params.limit = limit;
  const result = await fetchApi<{ sites: PgSite[]; query: string }>(
    apiKey,
    '/api/sites/search',
    params,
    options,
  );
  return result.sites;
}

/**
 * Sites whose name matches, plus the places the query names (a town such as
 * "Cali") with the sites near each. Name matches come first, then the
 * busiest sites.
 */
export async function searchSitesAndPlaces(
  apiKey: string,
  query: string,
  limit?: number,
): Promise<{ sites: PgSite[]; places: PgPlace[] }> {
  const params: Record<string, string | number> = { q: query, places: 1 };
  if (limit !== undefined) params.limit = limit;
  const result = await fetchApi<{ sites: PgSite[]; places?: PgPlace[] }>(
    apiKey,
    '/api/sites/search',
    params,
  );
  return { sites: result.sites, places: result.places ?? [] };
}

export async function getSitesByCountry(
  apiKey: string,
  country: string,
  limit?: number,
  offset?: number,
): Promise<{ sites: PgSite[]; total: number }> {
  const params: Record<string, string | number> = { country };
  if (limit !== undefined) params.limit = limit;
  if (offset !== undefined) params.offset = offset;
  return fetchApi<{ sites: PgSite[]; total: number }>(apiKey, '/api/sites', params);
}

export async function getSiteById(apiKey: string, id: string): Promise<PgSite | null> {
  try {
    return await fetchApi<PgSite>(apiKey, `/api/sites/${id}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

/** A private site as pgsites takes it to share: wind is N..NW, 2 good, 1 cross, 0 no. */
export interface SharedSiteBody {
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  wind: number[];
  kind: 'thermal' | 'ridge' | 'both' | 'sled' | null;
}

export type ShareResult =
  | { ok: true; id: string }
  /** A listed site already covers the launch */
  | { ok: false; listed: { id: string; name: string } };

/**
 * Shares a private site through pgsites, or changes the shared copy. `ref`
 * ("soarcast:<custom site id>") names it there. Throws when pgsites fails.
 */
export async function shareSite(
  apiKey: string,
  ref: string,
  site: SharedSiteBody,
): Promise<ShareResult> {
  const response = await fetch(new URL(`/api/shared-sites/${ref}`, BASE_URL), {
    method: 'PUT',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(site),
  });
  if (response.status === 409) {
    const body = (await response.json()) as { site: { id: string; name: string } };
    return { ok: false, listed: { id: body.site.id, name: body.site.name } };
  }
  if (!response.ok) throw new Error(`pgsites share: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { id: string };
  return { ok: true, id: body.id };
}

/** Takes a shared site back. Throws when pgsites fails. */
export async function unshareSite(apiKey: string, ref: string): Promise<void> {
  const response = await fetch(new URL(`/api/shared-sites/${ref}`, BASE_URL), {
    method: 'DELETE',
    headers: { 'X-API-Key': apiKey },
  });
  if (!response.ok) throw new Error(`pgsites unshare: ${response.status}`);
}

export async function nearbySites(
  apiKey: string,
  lat: number,
  lng: number,
  radius?: number,
  limit?: number,
): Promise<PgSite[]> {
  const params: Record<string, string | number> = { lat, lng };
  if (radius !== undefined) params.radius = radius;
  if (limit !== undefined) params.limit = limit;
  const result = await fetchApi<{
    sites: PgSite[];
    center: { lat: number; lng: number };
    radius_km: number;
  }>(apiKey, '/api/sites/near', params);
  return result.sites;
}

export async function getAllSites(
  apiKey: string,
  limit?: number,
  offset?: number,
): Promise<{ sites: PgSite[]; total: number }> {
  const params: Record<string, string | number> = {};
  if (limit !== undefined) params.limit = limit;
  if (offset !== undefined) params.offset = offset;
  return fetchApi<{ sites: PgSite[]; total: number }>(apiKey, '/api/sites', params);
}

/** A paragliding comp: FAI's calendar (CIVL Category 1 and 2) plus World Cup rounds. Dates are YYYY-MM-DD, end inclusive. */
export interface PgComp {
  id: string;
  source: 'fai' | 'curated';
  name: string;
  start_date: string;
  end_date: string;
  place: string;
  country_code: string | null;
  category: 1 | 2 | null;
  discipline: 'xc' | 'hike-fly' | 'accuracy' | 'acro';
  series: 'pwc' | 'pre-pwc' | null;
  url: string | null;
  source_url: string | null;
  /** The comp's place; null when it couldn't be placed */
  latitude: number | null;
  longitude: number | null;
  /** Only from compsNear */
  distance_km?: number;
}

export interface CompQuery {
  /** Comps overlapping from..to (YYYY-MM-DD); pgsites defaults to today on */
  from?: string;
  to?: string;
  disciplines?: PgComp['discipline'][];
  limit?: number;
}

function compParams(q: CompQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (q.from) params.from = q.from;
  if (q.to) params.to = q.to;
  if (q.disciplines?.length) params.discipline = q.disciplines.join(',');
  if (q.limit !== undefined) params.limit = q.limit;
  return params;
}

/** Comps worldwide, earliest first. */
export async function getComps(
  apiKey: string,
  q: CompQuery & { country?: string } = {},
): Promise<PgComp[]> {
  const params = compParams(q);
  if (q.country) params.country = q.country;
  const result = await fetchApi<{ comps: PgComp[] }>(apiKey, '/api/comps', params);
  return result.comps;
}

/** Comps held within `radiusKm` of a point, earliest first; from 2015 gives a place's history. */
export async function compsNear(
  apiKey: string,
  lat: number,
  lng: number,
  radiusKm: number,
  q: CompQuery = {},
): Promise<PgComp[]> {
  const result = await fetchApi<{ comps: PgComp[] }>(apiKey, '/api/comps/near', {
    lat,
    lng,
    radius: radiusKm,
    ...compParams(q),
  });
  return result.comps;
}

/** The site page slug for a pgsites site: name, then `--` and its UUID (see sites.$slug). */
export function pgsitesSlug(name: string, id: string): string {
  const nameSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${nameSlug}--${id}`;
}

/**
 * pgsites' sync progress; `last_modified_check` is the YYYYMMDD of the last
 * daily sync that worked, `last_incremental` its newest daily sync, failed or not.
 */
export async function getSyncStatus(apiKey: string): Promise<{
  last_modified_check: string | null;
  last_incremental?: PgsitesSyncRun | null;
  total_sites: number;
}> {
  return fetchApi(apiKey, '/api/sync/status', undefined, { fresh: true });
}

/** Get the pgsites API key from the Cloudflare Worker environment. */
export function getPgsitesApiKey(env: { PGSITES_API_KEY?: string }): string {
  return env.PGSITES_API_KEY || '';
}
