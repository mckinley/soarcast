import { eq } from 'drizzle-orm';
import type { Db } from '~/app/lib/db.server';
import { siteTerrain } from '~/db/schema';
import { studyTerrain, TERRAIN_VERSION, type TerrainStudy } from '~/lib/terrain-study';

// The terrain study of a launch (src/lib/terrain-study): kept in D1 for
// good once made, as the ground doesn't change. The first look at a pin
// reads its heights from Amazon, a few megabytes and a few seconds.

/** Each read of heights gives up after this long (ms). */
const TIMEOUT_MS = 15_000;

/** The pin to about 10 m: a pin moved further gets a new study. */
export function terrainKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

/** The study of the terrain round a pin, made now if it isn't kept. */
export async function terrainStudyAt(
  db: Db,
  place: { latitude: number; longitude: number },
): Promise<TerrainStudy> {
  const key = terrainKey(place.latitude, place.longitude);
  const [row] = await db.select().from(siteTerrain).where(eq(siteTerrain.key, key)).limit(1);
  if (row?.version === TERRAIN_VERSION) return JSON.parse(row.study) as TerrainStudy;
  const study = await studyTerrain(place.latitude, place.longitude, (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
  );
  const values = {
    version: TERRAIN_VERSION,
    study: JSON.stringify(study),
    createdAt: new Date(),
  };
  await db
    .insert(siteTerrain)
    .values({ key, ...values })
    .onConflictDoUpdate({ target: siteTerrain.key, set: values });
  return study;
}
