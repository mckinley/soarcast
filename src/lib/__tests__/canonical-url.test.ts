import { describe, expect, it } from 'vitest';
import { canonicalHref, canonicalRedirect } from '../canonical-url';

const ORIGIN = 'https://soarcast.mckinleyaviation.com';
const go = (path: string, method = 'GET') =>
  canonicalRedirect(new Request(`${ORIGIN}${path}`, { method }));

describe('canonicalRedirect (one page, one address)', () => {
  it('sends capitals and a trailing slash to the page once, keeping the query', () => {
    for (const [from, to] of [
      ['/Planning', '/planning'],
      ['/sites/browse/', '/sites/browse'],
      ['/Sites/Tiger-Mountain-22EE6C89/?days=3', '/sites/tiger-mountain-22ee6c89?days=3'],
      ['/Guide/', '/guide'],
    ]) {
      const response = go(from);
      expect(response?.status, from).toBe(301);
      expect(response?.headers.get('location'), from).toBe(`${ORIGIN}${to}`);
    }
  });

  it('leaves canonical paths, the API, files and other methods alone', () => {
    for (const path of [
      '/',
      '/sites/browse?q=chelan',
      '/api/auth/callback/Google',
      '/api/sites/near/',
      '/sitemap.xml',
      '/assets/entry.client-AbC1.js',
      '/sites/tiger-mountain-22ee6c89.data',
    ])
      expect(go(path), path).toBeNull();
    expect(go('/Planning', 'POST')).toBeNull();
  });

  it('names the page without its query in the canonical tag', () => {
    expect(canonicalHref(ORIGIN, '/guide/')).toBe(`${ORIGIN}/guide`);
    expect(canonicalHref(ORIGIN, '/')).toBe(`${ORIGIN}/`);
  });
});
