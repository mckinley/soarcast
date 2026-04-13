import type { LoaderFunctionArgs } from 'react-router';
import { nearbySites, getPgsitesApiKey } from '~/lib/pgsites-client';

// Resource route — no default export.

function generateSlug(name: string, id: string): string {
  const nameSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${nameSlug}--${id}`;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const apiKey = getPgsitesApiKey(env);
  const url = new URL(request.url);

  const lat = parseFloat(url.searchParams.get('lat') ?? '');
  const lng = parseFloat(url.searchParams.get('lng') ?? '');
  const radius = Math.min(parseFloat(url.searchParams.get('radius') ?? '100'), 5000);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10), 1000);

  if (isNaN(lat) || isNaN(lng)) {
    return new Response(JSON.stringify({ sites: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pgSites = await nearbySites(apiKey, lat, lng, radius, limit);

  const sites = pgSites.map((s) => ({
    id: s.id,
    name: s.name,
    slug: generateSlug(s.name, s.id),
    countryCode: s.country_code || null,
    region: null as null,
    latitude: s.latitude,
    longitude: s.longitude,
    altitude: s.altitude,
    windN: s.wind_n,
    windNe: s.wind_ne,
    windE: s.wind_e,
    windSe: s.wind_se,
    windS: s.wind_s,
    windSw: s.wind_sw,
    windW: s.wind_w,
    windNw: s.wind_nw,
    isParagliding: !!s.is_paragliding,
    isHanggliding: !!s.is_hanggliding,
    createdAt: s.created_at ? new Date(s.created_at * 1000).toISOString() : null,
  }));

  return new Response(JSON.stringify({ sites }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
