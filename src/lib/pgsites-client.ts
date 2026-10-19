const BASE_URL = 'https://pgsites.mckinleyaviation.com';

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
  /** What the site gives, as tagged on Paragliding Earth; only /api/sites/:id returns these */
  is_thermal?: number;
  is_soaring?: number;
  is_xc?: number;
  is_hike?: number;
  description: string;
  pge_link: string;
  created_at: number;
  updated_at: number;
}

async function fetchApi<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: { 'X-API-Key': apiKey },
  });

  if (!response.ok) {
    throw new Error(`pgsites API error: ${response.status} ${response.statusText} for ${path}`);
  }

  return response.json() as Promise<T>;
}

export async function searchSites(
  apiKey: string,
  query: string,
  limit?: number,
): Promise<PgSite[]> {
  const params: Record<string, string | number> = { q: query };
  if (limit !== undefined) params.limit = limit;
  const result = await fetchApi<{ sites: PgSite[]; query: string }>(
    apiKey,
    '/api/sites/search',
    params,
  );
  return result.sites;
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

/** The site page slug for a pgsites site: name, then `--` and its UUID (see sites.$slug). */
export function pgsitesSlug(name: string, id: string): string {
  const nameSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${nameSlug}--${id}`;
}

/** pgsites' sync progress; `last_modified_check` is the YYYYMMDD of the last daily sync. */
export async function getSyncStatus(
  apiKey: string,
): Promise<{ last_modified_check: string | null; total_sites: number }> {
  return fetchApi(apiKey, '/api/sync/status');
}

/** Get the pgsites API key from the Cloudflare Worker environment. */
export function getPgsitesApiKey(env: { PGSITES_API_KEY?: string }): string {
  return env.PGSITES_API_KEY || '';
}
