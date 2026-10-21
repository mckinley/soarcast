// A pilot's saved sites (Favorites and private sites) are grouped into areas:
// the places they fly, like home or a trip. On any day a pilot is in one
// place, so the dashboard shows one area at a time. An area is a pilot's own
// version of the flying areas on the Planning page (src/lib/destinations.ts).
// SoarCast places each new site by distance, and the pilot can rename, move
// and join areas in Settings.

import { calculateDistance } from './site-utils';
import { AREAS, AREA_RADIUS_KM } from './destinations';
import { compareDays } from './verdict-display';
import type { DayScore } from '@/types';

/** A new site joins the area of the nearest saved site within this distance: about a long day trip. */
export const AREA_JOIN_KM = 150;

/** Longest area name a pilot can type. */
export const AREA_NAME_MAX = 40;

interface Place {
  latitude: number;
  longitude: number;
}

/** A saved site as areas see it. */
export interface PlacedSite extends Place {
  /** "launch:<launch site id>" or "custom:<custom site id>" */
  key: string;
  name: string;
  /** Its area, or null when it has none yet */
  areaId: string | null;
}

/**
 * The name a new area starts with: the Planning flying area the site is in,
 * like "Cauca Valley", or else the site's own name.
 */
export function defaultAreaName(site: PlacedSite): string {
  let best: { name: string; km: number } | null = null;
  for (const area of AREAS) {
    const km = calculateDistance(site.latitude, site.longitude, area.latitude, area.longitude);
    if (km <= AREA_RADIUS_KM && (!best || km < best.km)) best = { name: area.name, km };
  }
  return best?.name ?? cleanAreaName(`Around ${site.name}`);
}

/** A name trimmed to one line of at most AREA_NAME_MAX characters; empty when there's nothing left. */
export function cleanAreaName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, AREA_NAME_MAX).trim();
}

/**
 * Places every site that has no area (or one that's gone), in the order
 * given, so list sites in the order they were saved. A site joins the area of
 * the nearest placed site within AREA_JOIN_KM, or starts a new area.
 */
export function assignAreas(
  sites: PlacedSite[],
  knownAreaIds: Set<string>,
  newId: () => string,
): { moves: Array<{ key: string; areaId: string }>; created: Array<{ id: string; name: string }> } {
  const placed = sites.filter((s) => s.areaId && knownAreaIds.has(s.areaId));
  const moves: Array<{ key: string; areaId: string }> = [];
  const created: Array<{ id: string; name: string }> = [];

  for (const site of sites) {
    if (site.areaId && knownAreaIds.has(site.areaId)) continue;
    const nearest = nearestSite(placed, site);
    const areaId =
      nearest && nearest.km <= AREA_JOIN_KM
        ? nearest.site.areaId!
        : (() => {
            const id = newId();
            created.push({ id, name: defaultAreaName(site) });
            return id;
          })();
    moves.push({ key: site.key, areaId });
    placed.push({ ...site, areaId });
  }
  return { moves, created };
}

function nearestSite<T extends Place>(sites: T[], to: Place): { site: T; km: number } | null {
  let best: { site: T; km: number } | null = null;
  for (const site of sites) {
    const km = calculateDistance(site.latitude, site.longitude, to.latitude, to.longitude);
    if (!best || km < best.km) best = { site, km };
  }
  return best;
}

/** The area with a site nearest to a place, and how far that site is. */
export function nearestArea<A extends { sites: Place[] }>(
  areas: A[],
  to: Place,
): { area: A; km: number } | null {
  let best: { area: A; km: number } | null = null;
  for (const area of areas) {
    const near = nearestSite(area.sites, to);
    if (near && (!best || near.km < best.km)) best = { area, km: near.km };
  }
  return best;
}

/**
 * An area's day: its best site that day, so the area is a go when any of its
 * sites is. Null when no site has that day.
 */
export function bestSiteDay<S>(
  sites: Array<{ site: S; scores: DayScore[] }>,
  date: string,
): { site: S; score: DayScore } | null {
  let best: { site: S; score: DayScore } | null = null;
  for (const { site, scores } of sites) {
    const score = scores.find((s) => s.date === date);
    if (score && (!best || compareDays(score, best.score) < 0)) best = { site, score };
  }
  return best;
}
