import { AsyncLocalStorage } from 'node:async_hooks';

// Where a request's time goes: database queries, calls to other services, and
// whether the Worker had to start fresh. worker.ts wraps every request, the D1
// binding and global fetch, then sends the numbers as a Server-Timing header
// and keeps one row per page load in request_timings.

/** A group of waits of one kind, such as every D1 query of a request. */
export interface TimingGroup {
  count: number;
  /** Summed duration, so waits that ran side by side can add up past the total */
  ms: number;
}

export interface RequestTiming {
  start: number;
  /** The first request this Worker instance served */
  cold: boolean;
  d1: TimingGroup;
  /** Calls to other services, by name (openmeteo, pgsites, or the host) */
  calls: Map<string, TimingGroup>;
}

// One store for the whole Worker, even if this module is bundled twice
const STORE_KEY = Symbol.for('soarcast.requestTiming');
const globals = globalThis as unknown as Record<symbol, AsyncLocalStorage<RequestTiming>>;
const store = (globals[STORE_KEY] ??= new AsyncLocalStorage<RequestTiming>());

let served = 0;

/** Runs a request with a fresh timing record that the wrappers below add to. */
export function withRequestTiming<T>(fn: (timing: RequestTiming) => Promise<T>): Promise<T> {
  const timing: RequestTiming = {
    start: Date.now(),
    cold: served++ === 0,
    d1: { count: 0, ms: 0 },
    calls: new Map(),
  };
  return store.run(timing, () => fn(timing));
}

function add(group: TimingGroup, ms: number) {
  group.count += 1;
  group.ms += ms;
}

async function timed<T>(record: (ms: number) => void, run: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await run();
  } finally {
    record(Date.now() - start);
  }
}

function recordD1(ms: number) {
  const timing = store.getStore();
  if (timing) add(timing.d1, ms);
}

/** The name a call to another service is counted under. */
export function callName(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'other';
  }
  if (host.endsWith('open-meteo.com')) return 'openmeteo';
  if (host === 'pgsites.mckinleyaviation.com' || host === 'staging.pgsites.mckinleyaviation.com')
    return 'pgsites';
  return host.replace(/[^a-z0-9.-]/gi, '');
}

const STATEMENT_RUNS = new Set(['first', 'all', 'run', 'raw']);
const realStatements = new WeakMap<object, D1PreparedStatement>();

function timedStatement(statement: D1PreparedStatement): D1PreparedStatement {
  const proxy = new Proxy(statement, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;
      if (prop === 'bind') {
        return (...params: unknown[]) => timedStatement(value.apply(target, params));
      }
      if (typeof prop === 'string' && STATEMENT_RUNS.has(prop)) {
        return (...args: unknown[]) => timed(recordD1, () => value.apply(target, args));
      }
      return value.bind(target);
    },
  });
  realStatements.set(proxy, statement);
  return proxy;
}

const timedDatabases = new WeakMap<D1Database, D1Database>();

/**
 * The D1 binding with every query timed. The same binding always gets the
 * same wrapper, so code that caches per binding (getDb) keeps working.
 */
export function timedD1(db: D1Database): D1Database {
  const existing = timedDatabases.get(db);
  if (existing) return existing;
  const proxy = new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;
      if (prop === 'prepare') {
        return (query: string) => timedStatement(value.call(target, query));
      }
      if (prop === 'batch') {
        return (statements: D1PreparedStatement[]) =>
          timed(recordD1, () =>
            value.call(
              target,
              statements.map((s) => realStatements.get(s) ?? s),
            ),
          );
      }
      if (prop === 'exec') {
        return (query: string) => timed(recordD1, () => value.call(target, query));
      }
      return value.bind(target);
    },
  });
  timedDatabases.set(db, proxy);
  return proxy;
}

let fetchTimed = false;

/** Times every outgoing fetch, by service. Safe to call more than once. */
export function timeOutgoingFetches() {
  if (fetchTimed) return;
  fetchTimed = true;
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const timing = store.getStore();
    if (!timing) return original(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const name = callName(url);
    return timed(
      (ms) => {
        const group = timing.calls.get(name) ?? { count: 0, ms: 0 };
        add(group, ms);
        timing.calls.set(name, group);
      },
      () => original(input, init),
    );
  }) as typeof fetch;
}

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The Server-Timing header: total, fresh start, D1, then each service. */
export function serverTimingHeader(timing: RequestTiming, totalMs: number): string {
  const parts = [`total;dur=${totalMs}`];
  if (timing.cold) parts.push('cold;desc="fresh start"');
  if (timing.d1.count > 0) {
    parts.push(`d1;desc="${count(timing.d1.count, 'query', 'queries')}";dur=${timing.d1.ms}`);
  }
  for (const [name, group] of timing.calls) {
    const metric = name.replace(/[^a-z0-9]/gi, '_');
    parts.push(`${metric};desc="${count(group.count, 'call', 'calls')}";dur=${group.ms}`);
  }
  return parts.join(', ');
}

/**
 * The page a request is for, with ids and slugs replaced, so stored timings
 * never say which site anyone looked at. Null for requests not worth keeping.
 */
export function timedPage(url: URL): string | null {
  let path = url.pathname;
  const data = path.endsWith('.data');
  if (data) path = path.slice(0, -'.data'.length) || '/';
  if (path === '/_root') path = '/';
  if (path.startsWith('/api/') || path.startsWith('/assets/')) return null;
  const pattern = path
    .replace(/^\/sites\/custom\/[^/]+\/edit$/, '/sites/custom/:id/edit')
    .replace(/^\/sites\/custom\/(?!new$)[^/]+$/, '/sites/custom/:id')
    .replace(/^\/sites\/(?!browse$|custom\/)[^/]+$/, '/sites/:slug')
    .replace(/^\/guide\/[^/]+$/, '/guide/:slug');
  if (!/^\/[a-z0-9/:_-]*$/i.test(pattern) || pattern.length > 60) return null;
  return data ? `${pattern} (data)` : pattern;
}
