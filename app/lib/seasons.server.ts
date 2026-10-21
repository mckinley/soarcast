import { eq, inArray, isNotNull } from 'drizzle-orm';
import type { getDb } from '~/app/lib/db.server';
import { siteSeasons, type SiteSeason } from '~/db/schema';
import { launchProfileFromSite } from '~/lib/forecast-engine';
import {
  bestMonths,
  decodeSeasonDays,
  launchProfileKey,
  seasonMonths,
  typicalWeekGoDays,
  type SeasonDay,
  type SeasonSummary,
} from '~/lib/seasons';
import type { Site, SiteGoal } from '~/types';

type Db = ReturnType<typeof getDb>;

/** "pg:<pgsites id>" or "custom:<id>", as the season build keys sites. */
export function seasonSiteRef(source: 'pgsites' | 'custom', id: string): string {
  return `${source === 'pgsites' ? 'pg' : 'custom'}:${id}`;
}

function summarize(row: SiteSeason, site: Site, goal: SiteGoal, today: string): SeasonSummary {
  return summarizeDays(row, decodeSeasonDays(row.days), site, goal, today);
}

function summarizeDays(
  row: SiteSeason,
  days: SeasonDay[],
  site: Site,
  goal: SiteGoal,
  today: string,
): SeasonSummary {
  const months = seasonMonths(days, goal);
  return {
    months,
    best: bestMonths(months),
    typicalWeek: typicalWeekGoDays(days, goal, today),
    fromDate: row.fromDate,
    toDate: row.toDate,
    sameSettings: row.key === `${row.siteRef}|${launchProfileKey(launchProfileFromSite(site))}`,
  };
}

/** The row rated with the site's settings, else the newest one for the site. */
function pickRow(rows: SiteSeason[], site: Site): SiteSeason | undefined {
  const key = launchProfileKey(launchProfileFromSite(site));
  return (
    rows.find((r) => r.key.endsWith(`|${key}`)) ??
    [...rows].sort((a, b) => b.builtAt.getTime() - a.builtAt.getTime())[0]
  );
}

/** A site's season, or null before the season build has rated it. */
export async function seasonForSite(
  db: Db,
  siteRef: string,
  site: Site,
  today: string,
): Promise<SeasonSummary | null> {
  return (await seasonWithDays(db, siteRef, site, today))?.summary ?? null;
}

/** A site's season and its rated days (for checks against flown days), or null. */
export async function seasonWithDays(
  db: Db,
  siteRef: string,
  site: Site,
  today: string,
): Promise<{ summary: SeasonSummary; days: SeasonDay[] } | null> {
  try {
    const rows = await db.select().from(siteSeasons).where(eq(siteSeasons.siteRef, siteRef));
    const row = pickRow(rows, site);
    if (!row) return null;
    const days = decodeSeasonDays(row.days);
    return { summary: summarizeDays(row, days, site, site.goal ?? 'soar', today), days };
  } catch (error) {
    console.error('Season lookup failed:', error);
    return null;
  }
}

/** Seasons for many sites at once, by siteRef (the dashboard and the Year page). */
export async function seasonsForSites(
  db: Db,
  sites: Array<{ siteRef: string; site: Site }>,
  today: string,
): Promise<Map<string, SeasonSummary>> {
  const out = new Map<string, SeasonSummary>();
  const refs = [...new Set(sites.map((s) => s.siteRef))];
  if (refs.length === 0) return out;
  try {
    const rows: SiteSeason[] = [];
    // D1 binds at most 100 parameters
    for (let i = 0; i < refs.length; i += 90) {
      rows.push(
        ...(await db
          .select()
          .from(siteSeasons)
          .where(inArray(siteSeasons.siteRef, refs.slice(i, i + 90)))),
      );
    }
    for (const { siteRef, site } of sites) {
      const row = pickRow(
        rows.filter((r) => r.siteRef === siteRef),
        site,
      );
      if (row) out.set(siteRef, summarize(row, site, site.goal ?? 'soar', today));
    }
  } catch (error) {
    console.error('Season lookup failed:', error);
  }
  return out;
}

/** Every destination's season row (the Year page's "Where to fly"). */
export async function destinationSeasons(db: Db): Promise<SiteSeason[]> {
  try {
    return await db.select().from(siteSeasons).where(isNotNull(siteSeasons.destination));
  } catch (error) {
    console.error('Destination seasons failed:', error);
    return [];
  }
}
