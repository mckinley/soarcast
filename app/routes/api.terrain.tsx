import type { LoaderFunctionArgs } from 'react-router';
import { analyzeTerrain } from '~/lib/terrain';
import { getPgsitesApiKey, nearbySites, pgsitesSlug } from '~/lib/pgsites-client';
import { calculateDistance } from '~/lib/site-utils';

// Resource route for the add-a-site form: at a pin, the launch elevation,
// a launch direction suggested from the terrain, and listed sites close by
// (so a pilot can follow one of those instead of adding a duplicate).

const NEARBY_RADIUS_KM = 2;

export interface TerrainResponse {
  elevation: number;
  suggestion: { good: number[]; ok: number[] };
  nearby: Array<{ name: string; slug: string; distanceKm: number }>;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (
    !url.searchParams.get('lat') ||
    !url.searchParams.get('lng') ||
    !(Math.abs(lat) <= 90) ||
    !(Math.abs(lng) <= 180)
  ) {
    return Response.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const [terrain, listed] = await Promise.allSettled([
    analyzeTerrain(lat, lng),
    nearbySites(getPgsitesApiKey(env), lat, lng, NEARBY_RADIUS_KM, 3),
  ]);

  if (terrain.status === 'rejected') {
    console.error('Terrain lookup failed:', terrain.reason);
    return Response.json({ error: 'Terrain lookup failed' }, { status: 502 });
  }

  const body: TerrainResponse = {
    elevation: terrain.value.elevation,
    suggestion: terrain.value.suggestion,
    nearby:
      listed.status === 'fulfilled'
        ? listed.value.map((s) => ({
            name: s.name,
            slug: pgsitesSlug(s.name, s.id),
            distanceKm: Math.round(calculateDistance(lat, lng, s.latitude, s.longitude) * 10) / 10,
          }))
        : [],
  };
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=86400' } });
}
