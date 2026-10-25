// How the site page (app/routes/sites.$slug.tsx) reads its address. A listed
// site has one: the slug pgsites gives it in every app, `tiger-mountain-22ee6c89`
// (src/lib/site-slug.ts). The page sends every older form there with a 301.

import type { LaunchSite } from '@/db/schema';
import type { PgSite } from './pgsites-client';
import { nameSlug, parseSiteRef, pickBySlug, siteSlug } from './site-slug';

export type SiteAddress =
  /** The shared slug, current or made from an older name */
  | { kind: 'slug'; slug: string; id8: string }
  /** A launch_sites, custom_sites or pgsites UUID: alerts sent before they linked by slug */
  | { kind: 'uuid'; id: string }
  /** `tiger-mountain--<pgsites UUID>`, the address before the shared slug */
  | { kind: 'legacy'; pgsitesId: string }
  /** A bare name, `tiger-mountain` */
  | { kind: 'name'; name: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LEGACY = /^[a-z0-9-]*--([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** What a /sites/<ref> address names; null when it can't name a site. */
export function readSiteAddress(ref: string): SiteAddress | null {
  const text = (ref ?? '').trim().toLowerCase();
  if (UUID.test(text)) return { kind: 'uuid', id: text };
  const legacy = LEGACY.exec(text);
  if (legacy) return { kind: 'legacy', pgsitesId: legacy[1] };
  const parsed = parseSiteRef(text);
  if (parsed?.kind === 'slug') return parsed;
  if (NAME.test(text)) return { kind: 'name', name: text.replace(/-/g, ' ') };
  return null;
}

/**
 * A followed site's address: its stored slug once that is the shared slug,
 * else the shared slug made from its name. The stored one changes when the
 * weekly refresh picks up a new name from pgsites.
 */
export function launchSiteSlug(row: Pick<LaunchSite, 'slug' | 'name' | 'pgsitesId'>): string {
  const stored = parseSiteRef(row.slug);
  return stored?.kind === 'slug' &&
    stored.slug === row.slug &&
    stored.id8 === row.pgsitesId.slice(0, 8).toLowerCase()
    ? row.slug
    : siteSlug(row.name, row.pgsitesId);
}

/** A pgsites site's address: the slug pgsites sends, or the same slug made here. */
export function pgSiteSlug(site: Pick<PgSite, 'name' | 'id' | 'slug'>): string {
  return site.slug ?? siteSlug(site.name, site.id);
}

/** Of the followed sites whose pgsites ID starts with a slug's 8 characters, the one it names. */
export function pickLaunchSite<T extends Pick<LaunchSite, 'slug' | 'name' | 'pgsitesId'>>(
  rows: T[],
  slug: string,
): T | null {
  const exact = rows.find((r) => launchSiteSlug(r) === slug);
  if (exact) return exact;
  const picked = pickBySlug(
    rows.map((row) => ({ id: row.pgsitesId, name: row.name, row })),
    slug,
  );
  return picked?.row ?? null;
}

/**
 * Of pgsites' search results for a slug's name, the site it names: the one
 * whose UUID starts with its 8 characters. For a pgsites copy that can't find
 * a site by its slug yet.
 */
export function matchSlugInResults(results: PgSite[], id8: string): PgSite | null {
  return results.find((s) => s.id.toLowerCase().startsWith(id8)) ?? null;
}

/** Of pgsites' search results for a bare name, the site with exactly that name. */
export function matchNameInResults(results: PgSite[], name: string): PgSite | null {
  const wanted = nameSlug(name);
  return results.find((s) => nameSlug(s.name) === wanted) ?? null;
}

/** The words of a slug's name, for a search: `tiger-mountain-22ee6c89` is `tiger mountain`. */
export function slugName(slug: string): string {
  return slug.replace(/-[0-9a-f]{8}$/, '').replace(/-/g, ' ');
}
