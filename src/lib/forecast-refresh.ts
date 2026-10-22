/** A saved site's place, keyed like its cached forecast. */
export interface Place {
  key: string;
  latitude: number;
  longitude: number;
}

/**
 * Refresh a copy that expires within this long: the hourly run plus a few
 * minutes, so no page finds it expired before the next run.
 */
export const REFRESH_AHEAD_MS = 70 * 60 * 1000;

/**
 * The places whose forecast needs fetching now: no copy yet first, then the
 * copies that expire soonest.
 */
export function duePlaces(places: Place[], expiries: Map<string, Date>, now: Date): Place[] {
  const cutoff = now.getTime() + REFRESH_AHEAD_MS;
  const expiry = (p: Place) => expiries.get(p.key)?.getTime() ?? -Infinity;
  return places.filter((p) => expiry(p) < cutoff).sort((a, b) => expiry(a) - expiry(b));
}
