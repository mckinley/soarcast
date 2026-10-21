import { and, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { customSites, launchSites, siteAreas, userFavoriteSites } from '~/db/schema';
import type { Db } from './db.server';
import { assignAreas, cleanAreaName, defaultAreaName, type PlacedSite } from '~/lib/site-areas';

/** A saved site, with when it was saved: sites are placed in that order. */
export interface SavedSite extends PlacedSite {
  savedAt: Date;
}

/** An area with its sites' keys. */
export interface AreaGroup {
  id: string;
  name: string;
  alerts: boolean;
  siteKeys: string[];
}

/** "launch:<launch site id>" or "custom:<custom site id>": a saved site's key. */
export function savedSiteKey(source: 'launch' | 'custom', id: string): string {
  return `${source}:${id}`;
}

function parseKey(key: string): { source: 'launch' | 'custom'; id: string } | null {
  const [source, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  return (source === 'launch' || source === 'custom') && id ? { source, id } : null;
}

async function runBatch(db: Db, statements: BatchItem<'sqlite'>[]): Promise<void> {
  if (statements.length === 0) return;
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

/** Sets a saved site's area: a favorite of a listed site, or a private site. */
function setSiteArea(db: Db, userId: string, key: string, areaId: string) {
  const site = parseKey(key);
  if (!site) return null;
  return site.source === 'launch'
    ? db
        .update(userFavoriteSites)
        .set({ areaId })
        .where(and(eq(userFavoriteSites.userId, userId), eq(userFavoriteSites.siteId, site.id)))
    : db
        .update(customSites)
        .set({ areaId })
        .where(and(eq(customSites.userId, userId), eq(customSites.id, site.id)));
}

/**
 * Puts every saved site in an area (a site saved since the last load joins
 * one by distance) and drops areas left with no sites. Returns the areas, the
 * one first saved in first, and each site's area by key.
 */
export async function syncAreas(
  db: Db,
  userId: string,
  sites: SavedSite[],
): Promise<{ areas: AreaGroup[]; areaOf: Map<string, string> }> {
  const rows = await db.select().from(siteAreas).where(eq(siteAreas.userId, userId));
  const ordered = [...sites].sort(
    (a, b) => a.savedAt.getTime() - b.savedAt.getTime() || a.name.localeCompare(b.name),
  );
  const { moves, created } = assignAreas(ordered, new Set(rows.map((r) => r.id)), () =>
    crypto.randomUUID(),
  );

  const areaOf = new Map<string, string>();
  for (const site of ordered) if (site.areaId) areaOf.set(site.key, site.areaId);
  for (const move of moves) areaOf.set(move.key, move.areaId);
  const used = new Set(areaOf.values());
  const empty = rows.filter((r) => !used.has(r.id)).map((r) => r.id);

  const writes: BatchItem<'sqlite'>[] = [
    ...created.map((a) => db.insert(siteAreas).values({ id: a.id, userId, name: a.name })),
    ...moves.flatMap((m) => setSiteArea(db, userId, m.key, m.areaId) ?? []),
  ];
  if (empty.length > 0) {
    writes.push(
      db.delete(siteAreas).where(and(eq(siteAreas.userId, userId), inArray(siteAreas.id, empty))),
    );
  }
  await runBatch(db, writes);

  const all = [
    ...rows
      .filter((r) => used.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, alerts: r.alerts })),
    ...created.map((a) => ({ ...a, alerts: true })),
  ];
  const areas = all.map((a) => ({
    ...a,
    siteKeys: ordered.filter((s) => areaOf.get(s.key) === a.id).map((s) => s.key),
  }));
  // Oldest first: ordered is by save time, so an area's first key is its oldest site
  const firstSaved = (a: AreaGroup) => ordered.findIndex((s) => s.key === a.siteKeys[0]);
  areas.sort((a, b) => firstSaved(a) - firstSaved(b));
  return { areas, areaOf };
}

/** The pilot's own area, or null. */
async function ownArea(db: Db, userId: string, areaId: string) {
  const [area] = await db
    .select()
    .from(siteAreas)
    .where(and(eq(siteAreas.id, areaId), eq(siteAreas.userId, userId)))
    .limit(1);
  return area ?? null;
}

export async function renameArea(db: Db, userId: string, areaId: string, name: string) {
  const clean = cleanAreaName(name);
  if (!clean) return false;
  await db
    .update(siteAreas)
    .set({ name: clean })
    .where(and(eq(siteAreas.id, areaId), eq(siteAreas.userId, userId)));
  return true;
}

export async function setAreaAlerts(db: Db, userId: string, areaId: string, alerts: boolean) {
  await db
    .update(siteAreas)
    .set({ alerts })
    .where(and(eq(siteAreas.id, areaId), eq(siteAreas.userId, userId)));
}

/** Moves every site of one area into another, and removes the first. */
export async function joinAreas(db: Db, userId: string, fromId: string, intoId: string) {
  if (fromId === intoId) return false;
  const [from, into] = await Promise.all([
    ownArea(db, userId, fromId),
    ownArea(db, userId, intoId),
  ]);
  if (!from || !into) return false;
  await runBatch(db, [
    db
      .update(userFavoriteSites)
      .set({ areaId: intoId })
      .where(and(eq(userFavoriteSites.userId, userId), eq(userFavoriteSites.areaId, fromId))),
    db
      .update(customSites)
      .set({ areaId: intoId })
      .where(and(eq(customSites.userId, userId), eq(customSites.areaId, fromId))),
    db.delete(siteAreas).where(and(eq(siteAreas.id, fromId), eq(siteAreas.userId, userId))),
  ]);
  return true;
}

/**
 * Moves a saved site into one of the pilot's areas, or into a new area of
 * its own (`areaId` "new"). An area left empty goes on the next load.
 */
export async function moveSite(db: Db, userId: string, key: string, areaId: string) {
  const site = parseKey(key);
  if (!site) return false;

  if (areaId !== 'new') {
    if (!(await ownArea(db, userId, areaId))) return false;
    const update = setSiteArea(db, userId, key, areaId);
    if (update) await update;
    return true;
  }

  const place =
    site.source === 'launch'
      ? (
          await db
            .select({
              name: launchSites.name,
              latitude: launchSites.latitude,
              longitude: launchSites.longitude,
            })
            .from(userFavoriteSites)
            .innerJoin(launchSites, eq(launchSites.id, userFavoriteSites.siteId))
            .where(and(eq(userFavoriteSites.userId, userId), eq(userFavoriteSites.siteId, site.id)))
            .limit(1)
        )[0]
      : await db
          .select()
          .from(customSites)
          .where(and(eq(customSites.userId, userId), eq(customSites.id, site.id)))
          .limit(1)
          .then(([c]) =>
            c
              ? {
                  name: c.name,
                  latitude: parseFloat(c.latitude),
                  longitude: parseFloat(c.longitude),
                }
              : undefined,
          );
  if (!place) return false;

  const id = crypto.randomUUID();
  const name = defaultAreaName({ key, areaId: null, ...place });
  const update = setSiteArea(db, userId, key, id);
  await runBatch(db, [
    db.insert(siteAreas).values({ id, userId, name }),
    ...(update ? [update] : []),
  ]);
  return true;
}

/**
 * Puts favorites of listed sites into the pilot's area called `name`, made
 * if they have none: how a Planning flying area is saved.
 */
export async function putInNamedArea(
  db: Db,
  userId: string,
  name: string,
  launchSiteIds: string[],
): Promise<string | null> {
  if (launchSiteIds.length === 0) return null;
  const [existing] = await db
    .select()
    .from(siteAreas)
    .where(and(eq(siteAreas.userId, userId), eq(siteAreas.name, name)))
    .limit(1);
  const id = existing?.id ?? crypto.randomUUID();
  await runBatch(db, [
    ...(existing ? [] : [db.insert(siteAreas).values({ id, userId, name })]),
    db
      .update(userFavoriteSites)
      .set({ areaId: id })
      .where(
        and(eq(userFavoriteSites.userId, userId), inArray(userFavoriteSites.siteId, launchSiteIds)),
      ),
  ]);
  return id;
}

/** Ids of the pilot's areas whose alerts are off. */
export async function mutedAreaIds(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: siteAreas.id })
    .from(siteAreas)
    .where(and(eq(siteAreas.userId, userId), eq(siteAreas.alerts, false)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Roughly where a visit comes from, from the connection: often within tens of
 * km, sometimes far off (a VPN, some mobile networks). Good enough to tell
 * home from a trip, never asked of the browser. Null in local dev.
 */
export function requestPlace(
  cf: IncomingRequestCfProperties | undefined,
): { latitude: number; longitude: number; city: string | null } | null {
  const latitude = parseFloat(String(cf?.latitude ?? ''));
  const longitude = parseFloat(String(cf?.longitude ?? ''));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, city: typeof cf?.city === 'string' ? cf.city : null };
}
