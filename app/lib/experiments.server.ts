import { eq } from 'drizzle-orm';
import type { Db } from '~/app/lib/db.server';
import { settings, siteEnsembles } from '~/db/schema';
import type { FlownDaysAt } from '~/app/lib/flown-days.server';
import { seasonWinds } from '~/app/lib/seasons.server';
import { flownWinds, type WindsExperiment } from '~/lib/flown-winds';
import type { EnsembleDay, HowSureExperiment } from '~/lib/ensembles';
import { launchProfileFromSite } from '~/lib/forecast-engine';
import { launchProfileKey } from '~/lib/seasons';
import type { Site } from '~/types';
import { terrainStudyAt } from '~/app/lib/terrain-study.server';
import { terrainView, type TerrainExperiment } from '~/lib/terrain-study';

// Experiments: ideas shown on site pages only to pilots who switch them on
// in Settings. The Guide's Experiments page says what each one is and how it
// tested. None changes a verdict.

/** Whether the signed-in pilot has switched experiments on. */
export async function showsExperiments(db: Db, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const [row] = await db
      .select({ on: settings.showExperiments })
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);
    return row?.on ?? false;
  } catch (error) {
    console.error('Experiments setting failed:', error);
    return false;
  }
}

/** Wind on flown days at a site, or why there's nothing to show. Never fails a page. */
export async function windsExperiment(
  db: Db,
  siteRef: string,
  site: Site,
  flown: Promise<FlownDaysAt | null>,
): Promise<WindsExperiment> {
  try {
    const [days, winds] = await Promise.all([flown, seasonWinds(db, siteRef, site)]);
    if (winds.length === 0) return { winds: null, why: 'no-winds' };
    const result = flownWinds(winds, days?.days ?? [], {
      ideal: site.idealWindDirections ?? [],
      ok: site.okWindDirections ?? [],
    });
    return result ? { winds: result, why: null } : { winds: null, why: 'few-flown' };
  } catch (error) {
    console.error('Wind on flown days failed:', error);
    return { winds: null, why: 'failed' };
  }
}

/** Today's date (YYYY-MM-DD) in a time zone. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/**
 * How sure: ECMWF's runs at a site from today on, as the morning's ensembles
 * job rated them (jobs/ensembles.ts), or why there's nothing to show. The
 * row rated with the site's settings, else the newest one. Never fails a page.
 */
export async function howSureExperiment(
  db: Db,
  siteRef: string,
  site: Site,
): Promise<HowSureExperiment> {
  try {
    const rows = await db.select().from(siteEnsembles).where(eq(siteEnsembles.siteRef, siteRef));
    const key = launchProfileKey(launchProfileFromSite(site));
    const row =
      rows.find((r) => r.key.endsWith(`|${key}`)) ??
      [...rows].sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime())[0];
    if (!row) return { days: null, fetchedAt: null, why: 'not-kept' };
    const today = todayIn(row.timeZone);
    const days = (JSON.parse(row.days) as EnsembleDay[]).filter((d) => d.date >= today);
    return { days, fetchedAt: row.fetchedAt.toISOString(), why: null };
  } catch (error) {
    console.error('How sure failed:', error);
    return { days: null, fetchedAt: null, why: 'failed' };
  }
}

/**
 * Terrain around the launch: the study of the ground round the pin, and
 * the sun on the launch in the site's time zone. Never fails a page.
 */
export async function terrainExperiment(
  db: Db,
  place: { latitude: number; longitude: number },
  today: string | null,
  timeZone: string | null,
): Promise<TerrainExperiment> {
  try {
    const study = await terrainStudyAt(db, place);
    return { view: terrainView(study, today, timeZone), why: null };
  } catch (error) {
    console.error('Terrain study failed:', error);
    return { view: null, why: 'failed' };
  }
}
