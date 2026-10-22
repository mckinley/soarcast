// Copies NOGA's map of cross-country takeoffs into noga_takeoffs, once a
// week (index.ts) or by hand (the "Cloudflare job" workflow on GitHub).
// Three small files, about 3.5 MB in all. A copy that can't be read leaves
// the last one in place.

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import {
  NOGA_FILES,
  NOGA_SYNC_STATE_KEY,
  parseNoga,
  type NogaSyncRun,
  type NogaTakeoff,
} from '../src/lib/noga';
import { fetchRetrying } from '../src/lib/season-build/fetch';
import type { JobsEnv } from './env';

const USER_AGENT = 'SoarCast (https://soarcast.mckinleyaviation.com)';
/** Fewer takeoffs than this means a broken file, not a smaller map. */
const MIN_TAKEOFFS = 1000;
const COLUMNS = [
  'id',
  'name',
  'country_code',
  'latitude',
  'longitude',
  'site_id',
  'site_name',
  'region_id',
  'region_name',
  'flights',
  'years',
  'by_month',
  'avg_points',
  'max_points',
  'fetched_at',
];
// D1 binds at most 100 values a statement
const ROWS_PER_STATEMENT = Math.floor(100 / COLUMNS.length);
const STATEMENTS_PER_BATCH = 50;

async function getJson(url: string): Promise<unknown> {
  const res = await fetchRetrying(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function values(t: NogaTakeoff, fetchedAt: number): unknown[] {
  return [
    t.id,
    t.name,
    t.countryCode,
    t.latitude,
    t.longitude,
    t.siteId,
    t.siteName,
    t.regionId,
    t.regionName,
    t.flights,
    t.years,
    JSON.stringify(t.byMonth),
    t.avgPoints,
    t.maxPoints,
    fetchedAt,
  ];
}

async function copy(env: JobsEnv): Promise<{ takeoffs: number; flights: number }> {
  const [takeoffs, sites, regions] = await Promise.all([
    getJson(NOGA_FILES.takeoffs),
    getJson(NOGA_FILES.sites),
    getJson(NOGA_FILES.regions),
  ]);
  const rows = parseNoga(takeoffs as never, sites as never, regions as never);
  if (rows.length < MIN_TAKEOFFS) throw new Error(`only ${rows.length} takeoffs read`);

  const fetchedAt = Math.floor(Date.now() / 1000);
  const statements: D1PreparedStatement[] = [];
  const placeholders = `(${COLUMNS.map(() => '?').join(', ')})`;
  const updates = COLUMNS.filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  for (let i = 0; i < rows.length; i += ROWS_PER_STATEMENT) {
    const chunk = rows.slice(i, i + ROWS_PER_STATEMENT);
    statements.push(
      env.DB.prepare(
        `INSERT INTO noga_takeoffs (${COLUMNS.join(', ')}) VALUES ${chunk.map(() => placeholders).join(', ')}
         ON CONFLICT(id) DO UPDATE SET ${updates}`,
      ).bind(...chunk.flatMap((t) => values(t, fetchedAt))),
    );
  }
  for (let i = 0; i < statements.length; i += STATEMENTS_PER_BATCH) {
    await env.DB.batch(statements.slice(i, i + STATEMENTS_PER_BATCH));
  }
  // Takeoffs NOGA no longer lists (a pilot can ask to have flights left out)
  await env.DB.prepare('DELETE FROM noga_takeoffs WHERE fetched_at < ?').bind(fetchedAt).run();
  const flights = rows.reduce((sum, t) => sum + t.flights, 0);
  console.log(`NOGA: ${rows.length} takeoffs, ${flights} flights`);
  return { takeoffs: rows.length, flights };
}

export class NogaSync extends WorkflowEntrypoint<JobsEnv, Record<string, never>> {
  async run(event: WorkflowEvent<Record<string, never>>, step: WorkflowStep) {
    const copied = await step.do(
      'copy',
      { retries: { limit: 2, delay: '5 minutes', backoff: 'exponential' }, timeout: '10 minutes' },
      () => copy(this.env),
    );
    return step.do('record', async () => {
      const run: NogaSyncRun = {
        instance: event.instanceId,
        finishedAt: new Date().toISOString(),
        ...copied,
      };
      await this.env.DB.prepare(
        `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
        .bind(NOGA_SYNC_STATE_KEY, JSON.stringify(run))
        .run();
      return run;
    });
  }
}
