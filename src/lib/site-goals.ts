// What a site can give (its kind) and what a pilot wants from it (their
// goal). A day is a go when it is flyable and gives the flight the goal asks
// for: a sled ride off a big hike-and-fly peak can be enough, while a trip
// site may only be worth it on an XC day.

import type { DayScore, SiteGoal, SiteKind } from '@/types';

export const SITE_KINDS: SiteKind[] = ['thermal', 'ridge', 'both', 'sled'];
export const SITE_GOALS: SiteGoal[] = ['launch', 'soar', 'great'];

export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  thermal: 'Thermals',
  ridge: 'Ridge soaring',
  both: 'Thermals and ridge',
  sled: 'Sled rides only',
};

export const GOAL_LABEL: Record<SiteGoal, string> = {
  launch: 'Safe launch is enough',
  soar: 'Soarable',
  great: 'Only a great day',
};

export const GOAL_HINT: Record<SiteGoal, string> = {
  launch: 'Any day you can launch safely, even if it is only a sled ride.',
  soar: 'Days with thermals or ridge lift to stay up in.',
  great: 'XC days, or long ridge days at a ridge site.',
};

export function isSiteKind(value: unknown): value is SiteKind {
  return typeof value === 'string' && (SITE_KINDS as string[]).includes(value);
}

export function isSiteGoal(value: unknown): value is SiteGoal {
  return typeof value === 'string' && (SITE_GOALS as string[]).includes(value);
}

/** Paraglidingearth.com's site tags as a kind; null when the site has none of them. */
export function siteKindFromTags(tags: {
  thermal?: boolean | number | null;
  soaring?: boolean | number | null;
  xc?: boolean | number | null;
}): SiteKind | null {
  const thermal = !!tags.thermal || !!tags.xc;
  const ridge = !!tags.soaring;
  if (thermal && ridge) return 'both';
  if (thermal) return 'thermal';
  if (ridge) return 'ridge';
  return null;
}

/**
 * The goal a site starts with. Hike-and-fly peaks nobody has tagged for
 * soaring, and sled-only sites, are worth it for any safe launch; anything
 * else is worth it when it's soarable.
 */
export function defaultGoal(kind: SiteKind | null | undefined, hikeAndFly = false): SiteGoal {
  if (kind === 'sled') return 'launch';
  if (hikeAndFly && !kind) return 'launch';
  return 'soar';
}

/** Whether a day is a go for `goal`: flyable, and the flight it gives is enough. */
export function meetsGoal(
  day: Pick<DayScore, 'verdict' | 'flight' | 'greatDay'>,
  goal: SiteGoal,
): boolean {
  if (day.verdict !== 'go') return false;
  if (goal === 'launch') return true;
  if (goal === 'soar') return !!day.flight && day.flight !== 'sled';
  return !!day.greatDay;
}
