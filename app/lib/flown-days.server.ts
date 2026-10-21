import { eq } from 'drizzle-orm';
import type { Db } from '~/app/lib/db.server';
import { flownDaysCache } from '~/db/schema';
import {
  FLOWN_RADIUS_KM,
  FLOWN_REFRESH_HOURS,
  flownFrom,
  flownHere,
  flownKey,
  type FlownDay,
  type FlownDaysQuery,
  type FlownHere,
} from '~/lib/flown-days';
import type { SeasonDay } from '~/lib/seasons';
import type { SiteGoal } from '~/types';

// Days pilots flew from a launch, from Syncing Pilots over the
// SYNCING_PILOTS service binding (its FlownDaysApi): every day from the
// start of the month two years back to today, kept in D1 and refetched once
// it is a few hours old. Never fails a page: without the binding or an
// answer it gives what it has, or null.

const MAX_AGE_MS = FLOWN_REFRESH_HOURS * 3600 * 1000;
const TIMEOUT_MS = 8000;

export interface FlownDaysAt {
  days: FlownDay[];
  fromDate: string;
  toDate: string;
  fetchedAt: Date;
}

export async function flownDaysAt(
  env: Pick<Env, 'SYNCING_PILOTS'>,
  db: Db,
  place: { latitude: number; longitude: number; altitude: number | null },
  timeZone: string,
  today: string,
): Promise<FlownDaysAt | null> {
  const query: FlownDaysQuery = {
    latitude: place.latitude,
    longitude: place.longitude,
    altitude: place.altitude || null,
    radiusKm: FLOWN_RADIUS_KM,
    from: flownFrom(today),
    to: today,
    timeZone,
  };
  const key = flownKey(query);
  let cached: FlownDaysAt | null = null;
  try {
    const row = await db.query.flownDaysCache.findFirst({ where: eq(flownDaysCache.key, key) });
    if (row) cached = { days: row.days, fromDate: row.fromDate, toDate: row.toDate, fetchedAt: row.fetchedAt };
  } catch (error) {
    console.error('Flown days cache read failed:', error);
  }
  if (cached && cached.toDate === today && Date.now() - cached.fetchedAt.getTime() < MAX_AGE_MS) return cached;
  if (!env.SYNCING_PILOTS) return cached;

  try {
    const result = await Promise.race([
      env.SYNCING_PILOTS.flownDays(query),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS)),
    ]);
    const fresh: FlownDaysAt = { days: result.days, fromDate: query.from, toDate: query.to, fetchedAt: new Date() };
    await db
      .insert(flownDaysCache)
      .values({ key, ...fresh })
      .onConflictDoUpdate({ target: flownDaysCache.key, set: fresh })
      .catch((error) => console.error('Flown days cache write failed:', error));
    return fresh;
  } catch (error) {
    console.error('Flown days from Syncing Pilots failed:', error);
    return cached;
  }
}

/** What a site page shows of the days flown there, or null without any. */
export async function flownHereFor(
  env: Pick<Env, 'SYNCING_PILOTS'>,
  db: Db,
  place: { latitude: number; longitude: number; altitude: number | null },
  timeZone: string,
  today: string,
  season: SeasonDay[] | null,
  goal: SiteGoal,
): Promise<FlownHere | null> {
  const flown = await flownDaysAt(env, db, place, timeZone, today);
  return flown ? flownHere(flown, season, goal) : null;
}
