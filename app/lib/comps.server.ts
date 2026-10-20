import { compsNear, getComps, getPgsitesApiKey, type CompQuery } from '~/lib/pgsites-client';
import { compFromPg, COMP_RADIUS_KM, type Comp } from '~/lib/comps';

/** pgsites collects FAI's calendar from this date on. */
const HISTORY_FROM = '2015-01-01';

/**
 * Comps held at a site: every one since 2015 and those listed up to the end
 * of the year after next, earliest first. Empty when pgsites can't be
 * reached, so a site page never fails over its comps.
 */
export async function compsAtSite(env: Env, latitude: number, longitude: number): Promise<Comp[]> {
  try {
    const comps = await compsNear(getPgsitesApiKey(env), latitude, longitude, COMP_RADIUS_KM, {
      from: HISTORY_FROM,
      to: `${new Date().getUTCFullYear() + 2}-12-31`,
      limit: 300,
    });
    return comps.map(compFromPg);
  } catch (error) {
    console.error('Comps for a site failed:', error);
    return [];
  }
}

/** Comps anywhere overlapping from..to, earliest first; null when pgsites can't be reached. */
export async function compsWorldwide(
  env: Env,
  q: CompQuery & { from: string; to: string },
): Promise<Comp[] | null> {
  try {
    const comps = await getComps(getPgsitesApiKey(env), { limit: 1000, ...q });
    return comps.map(compFromPg);
  } catch (error) {
    console.error('Comps failed:', error);
    return null;
  }
}
