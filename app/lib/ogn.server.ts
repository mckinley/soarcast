import { UP_NOW_AIR_KM } from '~/lib/up-now';
import { boxAround, ognNowNear, ognQuery, parseOgnMarkers, type OgnNow } from '~/lib/ogn';

// Gliders and paragliders flying near a launch now, from OGN's live map
// (rules in src/lib/ogn.ts). Each place's answer is kept in this data
// center's cache for a minute. Never fails a page: without an answer in
// time it gives null.

const TIMEOUT_MS = 4000;
const CACHE_SECONDS = 60;

function edgeCache(): Cache | null {
  return typeof caches === 'undefined'
    ? null
    : ((caches as unknown as { default?: Cache }).default ?? null);
}

const nowSec = () => Math.floor(Date.now() / 1000);

export async function ognNowAt(place: {
  latitude: number;
  longitude: number;
}): Promise<OgnNow | null> {
  try {
    const url = ognQuery(...boxAround(place.latitude, place.longitude, UP_NOW_AIR_KM));
    const cache = edgeCache();
    const key = new Request(url);
    let xml: string;
    let at: number;
    const hit = await cache?.match(key).catch(() => undefined);
    if (hit) {
      xml = await hit.text();
      at = Number(hit.headers.get('x-checked-at')) || nowSec();
    } else {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SoarCast (https://soarcast.mckinleyaviation.com)' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`OGN answered ${res.status}`);
      xml = await res.text();
      at = nowSec();
      await cache
        ?.put(
          key,
          new Response(xml, {
            headers: {
              'Content-Type': 'text/xml',
              'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
              'x-checked-at': String(at),
            },
          }),
        )
        .catch(() => undefined);
    }
    return ognNowNear(parseOgnMarkers(xml), place.latitude, place.longitude, UP_NOW_AIR_KM, at);
  } catch (error) {
    console.error('Flying now from OGN failed:', error);
    return null;
  }
}
