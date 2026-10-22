import { describe, expect, it } from 'vitest';
import {
  callName,
  serverTimingHeader,
  timedD1,
  timedPage,
  withRequestTiming,
} from '../request-timing';

function page(path: string) {
  return timedPage(new URL(`https://soarcast.example${path}`));
}

/** A stand-in for the D1 binding: statements carry their SQL and params. */
function fakeD1() {
  const batches: unknown[][] = [];
  class Statement {
    constructor(
      readonly sql: string,
      readonly params: unknown[] = [],
    ) {}
    bind(...params: unknown[]) {
      return new Statement(this.sql, params);
    }
    async all() {
      return { results: [{ sql: this.sql, params: this.params }] };
    }
    async first() {
      return { sql: this.sql };
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: unknown[]) => {
      batches.push(statements);
      return statements.map(() => ({ results: [] }));
    },
  };
  return { db: db as unknown as D1Database, batches, Statement };
}

describe('timedPage', () => {
  it('keeps the page, never the site', () => {
    expect(page('/')).toBe('/');
    expect(page('/dashboard?area=abc')).toBe('/dashboard');
    expect(page('/sites/tiger-mountain')).toBe('/sites/:slug');
    expect(page('/sites/mt.-si--1234')).toBe('/sites/:slug');
    expect(page('/sites/browse')).toBe('/sites/browse');
    expect(page('/sites/custom/new')).toBe('/sites/custom/new');
    expect(page('/sites/custom/abc')).toBe('/sites/custom/:id');
    expect(page('/sites/custom/abc/edit')).toBe('/sites/custom/:id/edit');
    expect(page('/guide/data-sources')).toBe('/guide/:slug');
  });

  it('marks data requests from page changes in the browser', () => {
    expect(page('/dashboard.data')).toBe('/dashboard (data)');
    expect(page('/_root.data')).toBe('/ (data)');
    expect(page('/sites/tiger-mountain.data')).toBe('/sites/:slug (data)');
  });

  it('skips API calls and files', () => {
    expect(page('/api/weather/profile')).toBeNull();
    expect(page('/assets/root.js')).toBeNull();
    expect(page('/favicon.ico')).toBeNull();
  });
});

describe('callName', () => {
  it('names the services pages call', () => {
    expect(callName('https://api.open-meteo.com/v1/forecast?x=1')).toBe('openmeteo');
    expect(callName('https://elevation-api.open-meteo.com/v1/x')).toBe('openmeteo');
    expect(callName('https://pgsites.mckinleyaviation.com/api/sites/near')).toBe('pgsites');
    expect(callName('https://aviationweather.gov/x')).toBe('aviationweather.gov');
    expect(callName('not a url')).toBe('other');
  });
});

describe('timedD1', () => {
  it('counts queries and batches, and still returns their results', async () => {
    const { db, batches, Statement } = fakeD1();
    const timed = timedD1(db);
    expect(timedD1(db)).toBe(timed);

    await withRequestTiming(async (timing) => {
      const row = await timed.prepare('SELECT ?').bind(1).all();
      expect(row.results).toEqual([{ sql: 'SELECT ?', params: [1] }]);
      await timed.prepare('SELECT 2').first();
      await timed.batch([timed.prepare('A'), timed.prepare('B').bind(2)]);
      expect(timing.d1.count).toBe(3);
    });
    // The batch got the real statements, not the wrappers
    expect(batches[0].every((s) => s instanceof Statement)).toBe(true);
  });

  it('works outside a timed request', async () => {
    const { db } = fakeD1();
    await expect(timedD1(db).prepare('SELECT 1').first()).resolves.toEqual({ sql: 'SELECT 1' });
  });
});

describe('serverTimingHeader', () => {
  it('lists the total, a fresh start, D1 and each service', () => {
    const header = serverTimingHeader(
      {
        start: 0,
        cold: true,
        d1: { count: 3, ms: 120 },
        calls: new Map([['openmeteo', { count: 1, ms: 900 }]]),
      },
      1100,
    );
    expect(header).toBe(
      'total;dur=1100, cold;desc="fresh start", d1;desc="3 queries";dur=120, openmeteo;desc="1 call";dur=900',
    );
  });
});
