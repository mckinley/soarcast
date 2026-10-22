import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSyncStatus, searchSites } from '../pgsites-client';

/** A stand-in for the Worker's edge cache, keyed by URL. */
function fakeCache() {
  const store = new Map<string, string>();
  return {
    store,
    default: {
      match: async (req: Request) => {
        const body = store.get(req.url);
        return body === undefined ? undefined : new Response(body);
      },
      put: async (req: Request, res: Response) => {
        store.set(req.url, await res.text());
      },
    },
  };
}

function fakeFetch() {
  return vi.fn(async () => Response.json({ sites: [{ id: 'a', name: 'Tiger' }], query: 'Tiger' }));
}

afterEach(() => vi.unstubAllGlobals());

describe('pgsites answers in the edge cache', () => {
  it('reuses an answer instead of calling pgsites again', async () => {
    const cache = fakeCache();
    const fetch = fakeFetch();
    vi.stubGlobal('caches', cache);
    vi.stubGlobal('fetch', fetch);

    const first = await searchSites('key', 'Tiger', 5);
    const second = await searchSites('key', 'Tiger', 5);
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    // The key never ends up in the cache
    expect([...cache.store.keys()][0]).not.toContain('key=');
  });

  it('asks pgsites itself when told to, as the health check does', async () => {
    vi.stubGlobal('caches', fakeCache());
    const fetch = fakeFetch();
    vi.stubGlobal('fetch', fetch);
    await searchSites('key', 'Tiger', 1, { fresh: true });
    await searchSites('key', 'Tiger', 1, { fresh: true });
    await getSyncStatus('key');
    await getSyncStatus('key');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('works without a cache, as in scripts', async () => {
    const fetch = fakeFetch();
    vi.stubGlobal('fetch', fetch);
    await searchSites('key', 'Tiger');
    await searchSites('key', 'Tiger');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
