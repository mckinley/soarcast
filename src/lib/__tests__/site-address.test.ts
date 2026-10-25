import { describe, expect, it } from 'vitest';
import { nameSlug, siteSlug } from '../site-slug';
import { pgsitesSlug, type PgSite } from '../pgsites-client';
import {
  launchSiteSlug,
  matchNameInResults,
  matchSlugInResults,
  pgSiteSlug,
  pickLaunchSite,
  readSiteAddress,
  slugName,
} from '../site-address';

const TIGER = '22ee6c89-ef7d-475c-a1fd-ac83f456fc04';

describe('the shared site slug', () => {
  // The same cases as pgsites' test/site-slug.test.ts: the copy must give its answers
  it('slugs a name the way pgsites does', () => {
    expect(siteSlug('Tiger Mountain', TIGER)).toBe('tiger-mountain-22ee6c89');
    expect(pgsitesSlug('Tiger Mountain', TIGER)).toBe('tiger-mountain-22ee6c89');
    expect(nameSlug('Zürich Höhenflug')).toBe('zuerich-hoehenflug');
    expect(nameSlug('ZÜRICH')).toBe('zuerich');
    expect(nameSlug('Großer Arber')).toBe('grosser-arber');
    expect(nameSlug('Zürich')).toBe('zuerich');
    expect(nameSlug('El Peñon')).toBe('el-penon');
    expect(nameSlug('Col de la Forclaz (Annecy)')).toBe('col-de-la-forclaz-annecy');
    expect(nameSlug('Łysa Góra')).toBe('lysa-gora');
    expect(nameSlug('Øyer – Hafjell')).toBe('oyer-hafjell');
    expect(nameSlug('Þingvellir')).toBe('thingvellir');
    expect(nameSlug('Ölüdeniz / Babadağ')).toBe('oeluedeniz-babadag');
    expect(nameSlug('Col d&#039;Annecy &amp; Planfait')).toBe('col-d-annecy-planfait');
    expect(nameSlug('  --Hill 42--  ')).toBe('hill-42');
    expect(nameSlug('पोखरा')).toBe('site');
    expect(siteSlug('八ヶ岳', 'ABCDEF12-0000-4000-8000-000000000000')).toBe('site-abcdef12');
    expect(nameSlug('Very long launch name with many many words that goes on and on and on')).toBe(
      'very-long-launch-name-with-many-many-words-that-goes-on-and',
    );
    expect(nameSlug('a'.repeat(70))).toBe('a'.repeat(60));
  });
});

describe('readSiteAddress', () => {
  it('reads the shared slug in any case', () => {
    expect(readSiteAddress('tiger-mountain-22ee6c89')).toEqual({
      kind: 'slug',
      slug: 'tiger-mountain-22ee6c89',
      id8: '22ee6c89',
    });
    expect(readSiteAddress('Tiger-Mountain-22EE6C89')).toMatchObject({
      kind: 'slug',
      id8: '22ee6c89',
    });
    expect(readSiteAddress('an-old-name-22ee6c89')).toMatchObject({ id8: '22ee6c89' });
  });

  it('reads the older forms', () => {
    expect(readSiteAddress(`tiger-mountain--${TIGER}`)).toEqual({
      kind: 'legacy',
      pgsitesId: TIGER,
    });
    expect(readSiteAddress(`--${TIGER}`)).toEqual({ kind: 'legacy', pgsitesId: TIGER });
    expect(readSiteAddress(TIGER.toUpperCase())).toEqual({ kind: 'uuid', id: TIGER });
    expect(readSiteAddress('tiger-mountain')).toEqual({ kind: 'name', name: 'tiger mountain' });
    expect(readSiteAddress('mt-si')).toEqual({ kind: 'name', name: 'mt si' });
  });

  it('turns down what names no site', () => {
    for (const bad of [
      '',
      '-',
      'tiger mountain',
      'tiger--mountain',
      'x.php',
      '../etc',
      'tiger_mountain',
    ])
      expect(readSiteAddress(bad), bad).toBeNull();
  });
});

const row = (slug: string, name: string, pgsitesId: string) => ({ slug, name, pgsitesId });

describe('launchSiteSlug', () => {
  it('keeps a stored shared slug, even one made from an older name', () => {
    expect(launchSiteSlug(row('tiger-mountain-22ee6c89', 'Tiger Mountain', TIGER))).toBe(
      'tiger-mountain-22ee6c89',
    );
    expect(launchSiteSlug(row('tiger-mtn-22ee6c89', 'Tiger Mountain', TIGER))).toBe(
      'tiger-mtn-22ee6c89',
    );
  });

  it('replaces a slug from before the shared one', () => {
    expect(launchSiteSlug(row(`tiger-mountain--${TIGER}`, 'Tiger Mountain', TIGER))).toBe(
      'tiger-mountain-22ee6c89',
    );
    expect(launchSiteSlug(row('tiger-mountain', 'Tiger Mountain', TIGER))).toBe(
      'tiger-mountain-22ee6c89',
    );
    // A slug whose 8 characters are another site's
    expect(launchSiteSlug(row('tiger-mountain-00000000', 'Tiger Mountain', TIGER))).toBe(
      'tiger-mountain-22ee6c89',
    );
  });
});

describe('pickLaunchSite', () => {
  const tiger = row(`tiger-mountain--${TIGER}`, 'Tiger Mountain', TIGER);
  const poo = row(
    'poo-poo-point-22ee6c89',
    'Poo Poo Point',
    '22ee6c89-0000-4000-8000-000000000002',
  );

  it('picks the site a slug names when two share 8 characters', () => {
    expect(pickLaunchSite([tiger, poo], 'poo-poo-point-22ee6c89')).toBe(poo);
    expect(pickLaunchSite([tiger, poo], 'tiger-mountain-22ee6c89')).toBe(tiger);
    expect(pickLaunchSite([tiger, poo], 'tiger-mtn-22ee6c89')).toBe(tiger);
    expect(pickLaunchSite([tiger], 'anything-22ee6c89')).toBe(tiger);
    expect(pickLaunchSite([], 'anything-22ee6c89')).toBeNull();
  });
});

const pg = (id: string, name: string, slug?: string) => ({ id, name, slug }) as PgSite;

describe('pgsites results', () => {
  it('uses the slug pgsites sends, else makes the same one', () => {
    expect(pgSiteSlug(pg(TIGER, 'Tiger Mountain', 'tiger-mountain-22ee6c89'))).toBe(
      'tiger-mountain-22ee6c89',
    );
    expect(pgSiteSlug(pg(TIGER, 'Tiger Mountain'))).toBe('tiger-mountain-22ee6c89');
  });

  it("finds a slug's site among search results by its 8 characters", () => {
    const results = [
      pg('11111111-0000-4000-8000-000000000000', 'Tiger Mountain East'),
      pg(TIGER, 'Tiger Mountain'),
    ];
    expect(slugName('tiger-mountain-22ee6c89')).toBe('tiger mountain');
    expect(matchSlugInResults(results, '22ee6c89')?.id).toBe(TIGER);
    expect(matchSlugInResults(results, '33333333')).toBeNull();
  });

  it('takes a bare name only when a site has exactly that name', () => {
    const results = [
      pg('11111111-0000-4000-8000-000000000000', 'Tiger Mountain East'),
      pg(TIGER, 'Tiger Mountain'),
    ];
    expect(matchNameInResults(results, 'tiger mountain')?.id).toBe(TIGER);
    expect(matchNameInResults(results, 'tiger')).toBeNull();
  });
});
