import type { LoaderFunctionArgs } from 'react-router';
import { AIRSPACE_MAX_ZOOM, AIRSPACE_MIN_ZOOM, openAipTileUrl } from '~/lib/map-layers';

// Airspace map tiles from openAIP for the map's Airspace layer
// (src/components/map-layers.tsx). openAIP asks that its API key stay
// secret, so the browser asks here and the Worker adds the key. Each tile is
// kept in this data center's cache for a day: airspace changes slowly.
// Without the OPENAIP_API_KEY secret every tile is a 404 and the root loader
// hides the layer.

const CACHE_SECONDS = 24 * 60 * 60;

function edgeCache(): Cache | null {
  return typeof caches === 'undefined'
    ? null
    : ((caches as unknown as { default?: Cache }).default ?? null);
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(params.y);
  const max = 2 ** z;
  if (
    !env.OPENAIP_API_KEY ||
    !Number.isInteger(z) ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    z < AIRSPACE_MIN_ZOOM ||
    z > AIRSPACE_MAX_ZOOM ||
    x < 0 ||
    y < 0 ||
    x >= max ||
    y >= max
  ) {
    return new Response(null, { status: 404 });
  }

  const cache = edgeCache();
  const cacheKey = new Request(new URL(`/api/airspace/${z}/${x}/${y}`, request.url).toString());
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;

  const upstream = await fetch(openAipTileUrl(z, x, y), {
    headers: { 'x-openaip-api-key': env.OPENAIP_API_KEY },
  }).catch(() => null);
  if (!upstream || !upstream.ok) {
    if (upstream && upstream.status !== 404) {
      console.error(`openAIP tile ${z}/${x}/${y} answered ${upstream.status}`);
    }
    return new Response(null, { status: upstream?.status === 404 ? 404 : 502 });
  }

  const body = await upstream.arrayBuffer();
  const response = new Response(body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    },
  });
  if (cache)
    context.cloudflare.ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
}
