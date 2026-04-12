import type { LoaderFunctionArgs } from 'react-router';
import { getSitesByCountry, getPgsitesApiKey } from '~/lib/pgsites-client';

// Resource route — no default export (no UI), just data endpoints.

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const apiKey = getPgsitesApiKey(env);
  const url = new URL(request.url);
  const country = url.searchParams.get('country') || 'US';
  const limit = parseInt(url.searchParams.get('limit') || '1000', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  const result = await getSitesByCountry(apiKey, country, limit, offset);

  const sites = result.sites.map((s) => {
    const nameSlug = s.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return {
      id: s.id,
      name: s.name,
      slug: `${nameSlug}-${s.id.slice(0, 8)}`,
      latitude: s.latitude,
      longitude: s.longitude,
      elevation: s.altitude,
      region: null,
      countryCode: s.country_code,
    };
  });

  return new Response(JSON.stringify({ sites, total: result.total }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
