import { eq } from 'drizzle-orm';
import { launchSites, type LaunchSite } from '~/db/schema';
import type { Db } from './db.server';
import { getSiteById } from '~/lib/pgsites-client';
import { launchSiteValuesFromPgSite, SITE_REFRESH_DAYS } from '~/lib/launch-sites';

const REFRESH_AFTER_MS = SITE_REFRESH_DAYS * 24 * 60 * 60 * 1000;
/** Sites refreshed per page load, so one load never waits on many lookups. */
const MAX_REFRESHES = 5;

/**
 * Brings stale copies of followed sites up to date with pgsites (directions,
 * text, and the tags that say whether a site thermals or ridge soars), and
 * returns the rows with any refreshed values. A failed lookup keeps the copy.
 */
export async function refreshLaunchSites(
  db: Db,
  apiKey: string,
  rows: LaunchSite[],
  now = new Date(),
): Promise<LaunchSite[]> {
  if (!apiKey) return rows;
  const stale = rows
    .filter(
      (r) =>
        r.source === 'pgsites' &&
        (!r.lastSyncedAt || now.getTime() - r.lastSyncedAt.getTime() > REFRESH_AFTER_MS),
    )
    .slice(0, MAX_REFRESHES);
  if (stale.length === 0) return rows;

  const refreshed = new Map<string, LaunchSite>();
  await Promise.all(
    stale.map(async (row) => {
      try {
        const pgSite = await getSiteById(apiKey, row.pgsitesId);
        if (!pgSite) return;
        // The slug stays: alerts and bookmarks link to it
        const changes = { ...launchSiteValuesFromPgSite(pgSite), slug: row.slug, updatedAt: now };
        await db.update(launchSites).set(changes).where(eq(launchSites.id, row.id));
        refreshed.set(row.id, { ...row, ...changes });
      } catch (error) {
        console.error(`Refreshing ${row.name} from pgsites failed:`, error);
      }
    }),
  );
  return rows.map((r) => refreshed.get(r.id) ?? r);
}

/**
 * The local copy of a listed site, copied from pgsites the first time anyone
 * follows it. Null when pgsites doesn't know the site.
 */
export async function ensureLaunchSite(
  db: Db,
  apiKey: string,
  pgsitesId: string,
): Promise<LaunchSite | null> {
  const byPgsitesId = () =>
    db.query.launchSites.findFirst({ where: eq(launchSites.pgsitesId, pgsitesId) });
  const existing = await byPgsitesId();
  if (existing) return existing;
  const pgSite = await getSiteById(apiKey, pgsitesId);
  if (!pgSite) return null;
  await db
    .insert(launchSites)
    .values({
      id: crypto.randomUUID(),
      ...launchSiteValuesFromPgSite(pgSite),
      source: 'pgsites',
      pgsitesId: pgSite.id,
    })
    .onConflictDoNothing();
  return (await byPgsitesId()) ?? null;
}
