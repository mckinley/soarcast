import { freshStations, nearQuery, nearestStations, type NearStation } from '~/lib/wind-now';

// Wind now at the stations nearest a launch, from winds.mobi (rules in
// src/lib/wind-now.ts). Each place's answer is kept in this data center's
// cache for a few minutes. Never fails a page: without an answer in time it
// gives null.

const TIMEOUT_MS = 4000;
const CACHE_SECONDS = 3 * 60;

export interface WindNow {
  stations: NearStation[];
  /** When SoarCast asked, unix seconds: the card counts each reading's age from it */
  checkedAt: number;
}

function edgeCache(): Cache | null {
  return typeof caches === 'undefined'
    ? null
    : ((caches as unknown as { default?: Cache }).default ?? null);
}

async function fetchStations(url: string): Promise<{ body: unknown; at: number }> {
  const cache = edgeCache();
  const key = new Request(url);
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) {
    return { body: await hit.json(), at: Number(hit.headers.get('x-checked-at')) || nowSec() };
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`winds.mobi answered ${res.status}`);
  const text = await res.text();
  const at = nowSec();
  if (cache) {
    const copy = new Response(text, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        'x-checked-at': String(at),
      },
    });
    await cache.put(key, copy).catch(() => undefined);
  }
  return { body: JSON.parse(text), at };
}

const nowSec = () => Math.floor(Date.now() / 1000);

export async function windNowAt(place: {
  latitude: number;
  longitude: number;
}): Promise<WindNow | null> {
  try {
    const { body, at } = await fetchStations(nearQuery(place.latitude, place.longitude));
    const stations = nearestStations(freshStations(body, at), place.latitude, place.longitude);
    return { stations, checkedAt: at };
  } catch (error) {
    console.error('Wind now from winds.mobi failed:', error);
    return null;
  }
}
