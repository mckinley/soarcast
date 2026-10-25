// The staging copy (docs/staging.md) must never touch production: not its
// database, storage, hostname, email or crons. And production must never get
// staging's /dev/login. Runs with `node --test`, no test framework needed.
//
// From the pjmgmt staging standard (mckinley/pjmgmt,
// scripts/automations/templates/staging/staging-config.test.mjs).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { unstable_readConfig } from 'wrangler';

const root = join(import.meta.dirname, '..');
const file = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].find((f) =>
  existsSync(join(root, f)),
);
const config = join(root, file);
const prod = unstable_readConfig({ config });
const staging = unstable_readConfig({ config, env: 'staging' });
const hosts = (staging.routes ?? []).map((r) =>
  (typeof r === 'string' ? r : r.pattern).replace(/\/\*$/, ''),
);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const usesAuth = 'better-auth' in { ...pkg.dependencies, ...pkg.devDependencies };

test('staging is its own Worker', () => {
  assert.match(staging.name, /-staging$/);
  assert.notEqual(staging.name, prod.name);
});

test('serves only staging hostnames, never workers.dev', () => {
  assert.ok(hosts.length > 0);
  for (const h of hosts) assert.match(h, /^staging\./, `${h} is staging.<production host>`);
  if (staging.vars?.BETTER_AUTH_URL)
    assert.ok(
      hosts.includes(new URL(staging.vars.BETTER_AUTH_URL).host),
      'BETTER_AUTH_URL is a staging host',
    );
  assert.equal(staging.workers_dev, false);
  assert.equal(staging.preview_urls, false);
});

test("uses its own database, KV and buckets, never production's", () => {
  for (const db of prod.d1_databases ?? []) {
    const own = (staging.d1_databases ?? []).find((d) => d.binding === db.binding);
    if (!own) continue;
    assert.notEqual(own.database_name, db.database_name);
    assert.notEqual(own.database_id, db.database_id);
    assert.match(own.database_name, /-staging(-db)?$/);
  }
  for (const kv of staging.kv_namespaces ?? [])
    assert.ok(
      !(prod.kv_namespaces ?? []).some((p) => p.id === kv.id),
      `KV ${kv.binding} is production's`,
    );
  for (const b of staging.r2_buckets ?? [])
    assert.ok(
      !(prod.r2_buckets ?? []).some((p) => p.bucket_name === b.bucket_name),
      `bucket ${b.binding} is production's`,
    );
});

test("calls only other apps' staging Workers", () => {
  for (const s of staging.services ?? [])
    assert.match(s.service, /-staging$/, `service binding ${s.binding} is ${s.service}`);
});

test('sends no email and runs only the crons it declares', () => {
  assert.deepEqual(staging.send_email ?? [], []);
  if (prod.triggers?.crons?.length)
    assert.notDeepEqual(
      staging.triggers?.crons,
      prod.triggers.crons,
      'env.staging declares its own triggers (often none)',
    );
});

test('turns on /dev/login for staging only', () => {
  if (usesAuth) assert.equal(staging.vars?.DEV_AUTH, 'true');
  assert.equal(staging.vars?.APP_ENV, 'staging');
  assert.equal(prod.vars?.DEV_AUTH, undefined);
  assert.equal(prod.vars?.APP_ENV, undefined);
});
