// A copy of pgsites' app/lib/site-slug.ts (mckinley/paragliding-sites): change it there
// first, then copy it here, so both give the same answer.
//
// The one slug a site has in every paragliding app (pjmgmt hq/groups/paragliding.md):
// its name slugged by pjmgmt's url-format rules plus the first 8 characters of
// its UUID, as in `tiger-mountain-22ee6c89`. pgsites mints it and every site in
// its API answers carries it as `slug`; the 8 characters are the lookup key, so
// a slug made from an older name still finds the site. SoarCast and Syncing
// Pilots read `slug` from the API, and a copy of this file in an app must give
// the same answer.

/** Letters that NFKD doesn't split into a base letter and an accent, plus the German umlauts. */
const LETTERS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  æ: 'ae',
  ø: 'o',
  œ: 'oe',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
};

/** At most this many characters before the ID, cut at a hyphen. */
const MAX_NAME = 60;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Paragliding Earth sends names with HTML entities in them ("Col d&#039;Annecy"). */
function decodeEntities(text: string): string {
  return text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (match, hex, dec, name) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? match;
    const code = parseInt(hex ?? dec, hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

/** The name part: lowercase ASCII words joined by hyphens, "site" when nothing is left. */
export function nameSlug(name: string): string {
  let slug = decodeEntities(name ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[äöüßæøœłđðþı]/g, (c) => LETTERS[c])
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > MAX_NAME) {
    const cut = slug.lastIndexOf('-', MAX_NAME);
    slug = slug.slice(0, cut > 0 ? cut : MAX_NAME).replace(/-+$/, '');
  }
  return slug || 'site';
}

/** A site's slug: `tiger-mountain-22ee6c89`. */
export function siteSlug(name: string, id: string): string {
  return `${nameSlug(name)}-${id.slice(0, 8).toLowerCase()}`;
}

/** What a site address names: its UUID, its Paragliding Earth number (negative for other sources), or a slug. */
export type SiteRef =
  | { kind: 'id'; id: string }
  | { kind: 'pge'; pgeSiteId: number }
  | { kind: 'slug'; slug: string; id8: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^(?:[a-z0-9]+-)+([0-9a-f]{8})$/;

export function parseSiteRef(ref: string): SiteRef | null {
  const text = (ref ?? '').trim().toLowerCase();
  if (UUID.test(text)) return { kind: 'id', id: text };
  if (/^-?\d{1,9}$/.test(text)) return { kind: 'pge', pgeSiteId: Number(text) };
  const slug = SLUG.exec(text);
  return slug ? { kind: 'slug', slug: text, id8: slug[1] } : null;
}

/**
 * Of the sites whose ID starts with a slug's 8 characters, the one it names:
 * the exact slug, else the one whose name shares the longest start with it
 * (a slug made from an older name). Two sites rarely share 8 characters.
 */
export function pickBySlug<T extends { id: string; name: string }>(
  candidates: T[],
  slug: string,
): T | null {
  if (candidates.length <= 1) return candidates[0] ?? null;
  const exact = candidates.find((c) => siteSlug(c.name, c.id) === slug);
  if (exact) return exact;
  const shared = (c: T) => {
    const own = siteSlug(c.name, c.id);
    let n = 0;
    while (n < own.length && own[n] === slug[n]) n++;
    return n;
  };
  return [...candidates].sort((a, b) => shared(b) - shared(a) || a.id.localeCompare(b.id))[0];
}
