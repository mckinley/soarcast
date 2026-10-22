import { FLOWN_RADIUS_KM } from '~/lib/flown-days';
import { UP_NOW_AIR_KM, type UpNowQuery, type UpNowResult } from '~/lib/up-now';

// Pilots up at a launch right now, from Syncing Pilots over the
// SYNCING_PILOTS service binding (its FlownDaysApi.upNow): counts only, live,
// never kept. Never fails a page: without the binding or an answer in time
// it gives null.

const TIMEOUT_MS = 4000;

export async function upNowAt(
  env: Pick<Env, 'SYNCING_PILOTS'>,
  place: { latitude: number; longitude: number; altitude: number | null },
  timeZone: string,
): Promise<UpNowResult | null> {
  if (!env.SYNCING_PILOTS) return null;
  const query: UpNowQuery = {
    latitude: place.latitude,
    longitude: place.longitude,
    altitude: place.altitude || null,
    radiusKm: FLOWN_RADIUS_KM,
    airRadiusKm: UP_NOW_AIR_KM,
    timeZone,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      env.SYNCING_PILOTS.upNow(query),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.error('Up now from Syncing Pilots failed:', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
