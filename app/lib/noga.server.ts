import { and, between, eq } from 'drizzle-orm';
import { nogaTakeoffs, type Db } from '~/app/lib/db.server';
import { NOGA_NEAR_KM, siteFlights, type NogaFlights, type NogaTakeoff } from '~/lib/noga';

type Row = typeof nogaTakeoffs.$inferSelect;

function fromRow(row: Row): NogaTakeoff {
  return { ...row, byMonth: JSON.parse(row.byMonth) as number[] };
}

/**
 * The cross-country flights from the NOGA site a launch is part of, or null
 * when no NOGA takeoff is within NOGA_NEAR_KM. Never fails a page.
 */
export async function nogaFlightsAt(
  db: Db,
  latitude: number,
  longitude: number,
): Promise<NogaFlights | null> {
  try {
    const dLat = NOGA_NEAR_KM / 111;
    const dLng = dLat / Math.max(0.1, Math.cos((latitude * Math.PI) / 180));
    const near = await db
      .select({ siteId: nogaTakeoffs.siteId })
      .from(nogaTakeoffs)
      .where(
        and(
          between(nogaTakeoffs.latitude, latitude - dLat, latitude + dLat),
          between(nogaTakeoffs.longitude, longitude - dLng, longitude + dLng),
        ),
      );
    if (near.length === 0) return null;
    const siteIds = [...new Set(near.map((r) => r.siteId))];
    const rows = (
      await Promise.all(
        siteIds.map((id) => db.select().from(nogaTakeoffs).where(eq(nogaTakeoffs.siteId, id))),
      )
    ).flat();
    return siteFlights(rows.map(fromRow), latitude, longitude);
  } catch (error) {
    console.error('NOGA flights for a site failed:', error);
    return null;
  }
}

// Every takeoff, kept for an hour in each Worker instance (Planning adds
// them up by area and country; about 2,000 small rows)
const KEEP_MS = 60 * 60 * 1000;
let cached: { at: number; takeoffs: NogaTakeoff[] } | null = null;

/** Every NOGA takeoff; empty when they can't be read. */
export async function allNogaTakeoffs(db: Db): Promise<NogaTakeoff[]> {
  if (cached && Date.now() - cached.at < KEEP_MS) return cached.takeoffs;
  try {
    const takeoffs = (await db.select().from(nogaTakeoffs)).map(fromRow);
    // An empty table is the copy not made yet; ask again next time
    if (takeoffs.length > 0) cached = { at: Date.now(), takeoffs };
    return takeoffs;
  } catch (error) {
    console.error('NOGA takeoffs failed:', error);
    return [];
  }
}
