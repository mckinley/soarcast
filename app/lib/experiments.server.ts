import { eq } from 'drizzle-orm';
import type { Db } from '~/app/lib/db.server';
import { settings } from '~/db/schema';
import type { FlownDaysAt } from '~/app/lib/flown-days.server';
import { seasonWinds } from '~/app/lib/seasons.server';
import { flownWinds, type WindsExperiment } from '~/lib/flown-winds';
import type { Site } from '~/types';

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
