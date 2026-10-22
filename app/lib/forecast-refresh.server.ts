import { eq, inArray, lt, sql } from 'drizzle-orm';
import { atmosphericProfilesCache, customSites, launchSites, userFavoriteSites } from '~/db/schema';
import type { Db } from './db.server';
import { profileLocationKey, refreshAtmosphericProfile, setProfileDb } from '~/lib/weather-profile';
import { mapWithConcurrency } from '~/lib/utils';
import { addDays } from '~/lib/alert-schedule';
import { duePlaces, type Place } from '~/lib/forecast-refresh';

/** Forecasts fetched at once: Open-Meteo rate-limits bursts. */
const CONCURRENCY = 2;
/** At most this many places per run, so a run never spends much of the daily quota. */
const MAX_PER_RUN = 60;
/** Copies are deleted once their fetch date is this many days old. */
const KEEP_DAYS = 2;
/** D1 binds at most 100 parameters per query. */
const KEYS_PER_QUERY = 90;

export interface RefreshRun {
  places: number;
  due: number;
  refreshed: number;
  failed: number;
  pruned: number;
}

/** Every saved site's place (favorites and private sites), once each. */
async function savedPlaces(db: Db): Promise<Place[]> {
  const [favorites, customs] = await Promise.all([
    db
      .selectDistinct({ latitude: launchSites.latitude, longitude: launchSites.longitude })
      .from(userFavoriteSites)
      .innerJoin(launchSites, eq(launchSites.id, userFavoriteSites.siteId)),
    db
      .selectDistinct({ latitude: customSites.latitude, longitude: customSites.longitude })
      .from(customSites),
  ]);
  const places = new Map<string, Place>();
  for (const p of [
    ...favorites,
    ...customs.map((c) => ({
      latitude: parseFloat(c.latitude),
      longitude: parseFloat(c.longitude),
    })),
  ]) {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
    const key = profileLocationKey(p.latitude, p.longitude);
    if (!places.has(key)) places.set(key, { key, ...p });
  }
  return [...places.values()];
}

/** When each place's newest cached copy expires. */
async function expiries(db: Db, keys: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  for (let i = 0; i < keys.length; i += KEYS_PER_QUERY) {
    const rows = await db
      .select({
        key: atmosphericProfilesCache.locationKey,
        expiresAt: sql<number>`max(${atmosphericProfilesCache.expiresAt})`,
      })
      .from(atmosphericProfilesCache)
      .where(inArray(atmosphericProfilesCache.locationKey, keys.slice(i, i + KEYS_PER_QUERY)))
      .groupBy(atmosphericProfilesCache.locationKey);
    for (const row of rows) out.set(row.key, new Date(row.expiresAt * 1000));
  }
  return out;
}

/**
 * Fetches new forecasts for saved sites whose copy expires before the next
 * hourly run, so their pages read the cache instead of waiting on
 * Open-Meteo, then deletes copies from earlier days.
 */
export async function refreshSavedForecasts(db: Db, now = new Date()): Promise<RefreshRun> {
  setProfileDb(db);
  const places = await savedPlaces(db);
  const due = duePlaces(
    places,
    await expiries(
      db,
      places.map((p) => p.key),
    ),
    now,
  ).slice(0, MAX_PER_RUN);

  let refreshed = 0;
  let failed = 0;
  await mapWithConcurrency(due, CONCURRENCY, async (place) => {
    try {
      await refreshAtmosphericProfile(place.latitude, place.longitude);
      refreshed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Refreshing the forecast at ${place.key} failed:`, error);
    }
  });

  const oldest = addDays(now.toISOString().slice(0, 10), -KEEP_DAYS);
  const pruned = await db
    .delete(atmosphericProfilesCache)
    .where(lt(atmosphericProfilesCache.fetchDate, oldest))
    .run();

  return {
    places: places.length,
    due: due.length,
    refreshed,
    failed,
    pruned: pruned.meta.changes ?? 0,
  };
}
