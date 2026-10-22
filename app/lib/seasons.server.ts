import { eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { getDb } from '~/app/lib/db.server';
import { siteSeasons, type SiteSeason } from '~/db/schema';
import { launchProfileFromSite } from '~/lib/forecast-engine';
import {
  decodeSeasonDays,
  launchProfileKey,
  seasonStats,
  summaryFromStats,
  type SeasonDay,
  type SeasonStats,
  type SeasonSummary,
} from '~/lib/seasons';
import type { Site, SiteGoal } from '~/types';

type Db = ReturnType<typeof getDb>;

/** "pg:<pgsites id>" or "custom:<id>", as the season build keys sites. */
export function seasonSiteRef(source: 'pgsites' | 'custom', id: string): string {
  return `${source === 'pgsites' ? 'pg' : 'custom'}:${id}`;
}

/** A row without its day list, unless it is an old row that has nothing else. */
export type SeasonRow = Omit<SiteSeason, 'days'> & { days: string };

// The day list only where there's no summary: rows from before it
const lightColumns = {
  key: siteSeasons.key,
  siteRef: siteSeasons.siteRef,
  name: siteSeasons.name,
  countryCode: siteSeasons.countryCode,
  latitude: siteSeasons.latitude,
  longitude: siteSeasons.longitude,
  destination: siteSeasons.destination,
  fromDate: siteSeasons.fromDate,
  toDate: siteSeasons.toDate,
  builtAt: siteSeasons.builtAt,
  engineVersion: siteSeasons.engineVersion,
  source: siteSeasons.source,
  summary: siteSeasons.summary,
  days: sql<string>`case when ${siteSeasons.summary} is null then ${siteSeasons.days} else '' end`,
};

const parsed = new WeakMap<SeasonRow, SeasonStats>();

/** A row's season as stored: its summary, or its days summed the same way. */
export function rowStats(row: SeasonRow): SeasonStats {
  let stats = parsed.get(row);
  if (!stats) {
    stats = row.summary
      ? (JSON.parse(row.summary) as SeasonStats)
      : seasonStats(decodeSeasonDays(row.days));
    parsed.set(row, stats);
  }
  return stats;
}

function summarize(row: SeasonRow, site: Site, goal: SiteGoal, today: string): SeasonSummary {
  return {
    ...summaryFromStats(rowStats(row), goal, today),
    source: row.source === 'era5' ? 'era5' : 'forecast',
    fromDate: row.fromDate,
    toDate: row.toDate,
    sameSettings: row.key === `${row.siteRef}|${launchProfileKey(launchProfileFromSite(site))}`,
  };
}

/** The row rated with the site's settings, else the newest one for the site. */
function pickRow<T extends SeasonRow>(rows: T[], site: Site): T | undefined {
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

/**
 * A site's season and its latest days rated one by one (the last
 * SEASON_MONTHS months, for checks against flown days), or null.
 */
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
    return {
      summary: summarize(row, site, site.goal ?? 'soar', today),
      days: decodeSeasonDays(row.days),
    };
  } catch (error) {
    console.error('Season lookup failed:', error);
    return null;
  }
}

/** Seasons for many sites at once, by siteRef (the dashboard and the Planning page). */
export async function seasonsForSites(
  db: Db,
  sites: Array<{ siteRef: string; site: Site }>,
  today: string,
): Promise<Map<string, SeasonSummary>> {
  const out = new Map<string, SeasonSummary>();
  const refs = [...new Set(sites.map((s) => s.siteRef))];
  if (refs.length === 0) return out;
  try {
    const rows: SeasonRow[] = [];
    // D1 binds at most 100 parameters
    for (let i = 0; i < refs.length; i += 90) {
      rows.push(
        ...(await db
          .select(lightColumns)
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

/** Every destination's season row, without its day list (the Planning page's "Where to fly"). */
export async function destinationSeasons(db: Db): Promise<SeasonRow[]> {
  try {
    return await db
      .select(lightColumns)
      .from(siteSeasons)
      .where(isNotNull(siteSeasons.destination));
  } catch (error) {
    console.error('Destination seasons failed:', error);
    return [];
  }
}
