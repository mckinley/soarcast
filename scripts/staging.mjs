#!/usr/bin/env node
// staging: deploy this app's staging copy (docs/staging.md), with its own
// Worker and database, loaded with fake data.
//
//   node scripts/staging.mjs deploy            # what the Staging workflow runs
//   node scripts/staging.mjs deploy --reset    # delete the database first, reload the fake data
//   --dry-run   say what would run, change nothing
//
// Everything comes from `env.staging` in the wrangler config, read with
// wrangler's own reader: the Worker's name, its D1 database and its
// BETTER_AUTH_URL. The database id in the config is the placeholder
// STAGING_D1_DATABASE_ID; this fills it in for the deploy and puts it back.
//
// In order:
//  1. find the staging database, creating it the first time (--reset deletes
//     it first, so nothing a dropped branch's migration added outlives it);
//  2. apply the migrations;
//  3. load the fake data when the database has no users yet (always after
//     --reset): the SQL `npm run staging:seed` prints;
//  4. build with CLOUDFLARE_ENV=staging, refuse a build that doesn't name the
//     staging Worker and database, and deploy it (an app built without
//     @cloudflare/vite-plugin, whose wrangler config names its own entry, is
//     built as usual and deployed with `wrangler deploy --env staging`);
//  5. the first time only, give the Worker a random BETTER_AUTH_SECRET; and
//     every time, set each STAGING_SECRET_<NAME> in the environment as the
//     Worker secret <NAME> (the workflow passes them from repository secrets,
//     such as a Stripe test key).
//
// `npm run staging:build` replaces `npm run build` when the app has it (an
// OpenNext app builds its Worker with `opennextjs-cloudflare build`).
//
// It refuses to touch any database or Worker whose name doesn't end in
// -staging / -staging-db, so production is out of reach whatever the config says.
// Needs CLOUDFLARE_API_TOKEN, or `wrangler login` when run by hand.
//
// From the pjmgmt staging standard (mckinley/pjmgmt,
// scripts/automations/templates/staging/). Change it there, then copy it into
// each app.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENV = 'staging';
const BINDING = 'DB';
const PLACEHOLDER = 'STAGING_D1_DATABASE_ID';
const CONFIGS = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'];
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== 'deploy')
    return { error: 'Usage: node scripts/staging.mjs deploy [--reset] [--dry-run]' };
  const opts = { reset: false, dryRun: false };
  for (const arg of rest) {
    if (arg === '--reset') opts.reset = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else return { error: `Unknown option: ${arg}` };
  }
  return opts;
}

/** The staging Worker, database and URL, or { error }. */
export function stagingTarget(prod, staging) {
  if (!staging?.name) return { error: `No env.${ENV} in the wrangler config.` };
  const db = (staging.d1_databases ?? []).find((d) => d.binding === BINDING);
  const prodDb = (prod.d1_databases ?? []).find((d) => d.binding === BINDING);
  if (!/-staging$/.test(staging.name) || staging.name === prod.name)
    return { error: `The staging Worker is "${staging.name}"; it must end in -staging.` };
  if (prodDb && !db) return { error: `env.${ENV} has no D1 database bound as ${BINDING}.` };
  if (
    db &&
    (!/-staging(-db)?$/.test(db.database_name) || db.database_name === prodDb?.database_name)
  )
    return { error: `The staging database is "${db.database_name}"; it must end in -staging-db.` };
  const route = (staging.routes ?? [])[0];
  const host = typeof route === 'string' ? route : route?.pattern;
  const url =
    staging.vars?.BETTER_AUTH_URL ?? (host ? `https://${host.replace(/\/\*$/, '')}` : null);
  return { worker: staging.name, db: db?.database_name ?? null, url };
}

function run(cmd, args, { input, env, capture } = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'],
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  // Arguments never carry a secret (secrets go in on stdin)
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${result.status}`);
  return result.stdout ?? '';
}

const wrangler = (args, opts) => run('npx', ['wrangler', ...args], opts);

/** The JSON wrangler printed, skipping any notes before it. */
export function parseJsonOutput(stdout) {
  const start = stdout.search(/^[[{]/m);
  if (start < 0) throw new Error(`wrangler printed no JSON: ${stdout.trim().slice(0, 200)}`);
  return JSON.parse(stdout.slice(start));
}

async function readConfigs(configPath) {
  const log = console.log;
  console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
  try {
    const { unstable_readConfig } = await import('wrangler');
    return [
      unstable_readConfig({ config: configPath }),
      unstable_readConfig({ config: configPath, env: ENV }),
    ];
  } finally {
    console.log = log;
  }
}

function databaseId(name) {
  const list = parseJsonOutput(wrangler(['d1', 'list', '--json'], { capture: true }));
  return list.find((d) => d.name === name)?.uuid ?? null;
}

function ensureDatabase(name) {
  let id = databaseId(name);
  if (!id) {
    console.log(`staging: creating D1 database ${name}`);
    wrangler(['d1', 'create', name]);
    id = databaseId(name);
  }
  if (!id) throw new Error(`staging: ${name} was not found after creating it`);
  return id;
}

/** By exact name only: `wrangler d1 delete DB` would resolve production's binding. */
function deleteDatabase(name) {
  if (!/-staging(-db)?$/.test(name)) throw new Error(`staging: refusing to delete ${name}`);
  if (!databaseId(name)) return;
  console.log(`staging: deleting D1 database ${name} (reset)`);
  wrangler(['d1', 'delete', name, '--skip-confirmation']);
}

/** Puts the database id into the config; returns a function that restores it. */
function writeDatabaseId(configPath, id) {
  const original = readFileSync(configPath, 'utf8');
  if (!original.includes(PLACEHOLDER))
    throw new Error(`staging: ${configPath} has no ${PLACEHOLDER} placeholder`);
  writeFileSync(configPath, original.replaceAll(PLACEHOLDER, id));
  return () => writeFileSync(configPath, original);
}

const onStaging = ['--remote', '--env', ENV];

function userCount(db) {
  try {
    const out = wrangler(
      ['d1', 'execute', db, ...onStaging, '--json', '--command', 'SELECT COUNT(*) AS n FROM user'],
      { capture: true },
    );
    return parseJsonOutput(out)[0]?.results?.[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

function loadFakeData(db) {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  if (!pkg.scripts?.['staging:seed']) {
    console.log('staging: no staging:seed script, so no fake data loaded');
    return false;
  }
  const sql = run('npm', ['run', '--silent', 'staging:seed'], { capture: true });
  const file = join(mkdtempSync(join(tmpdir(), 'staging-seed-')), 'seed.sql');
  writeFileSync(file, sql);
  wrangler(['d1', 'execute', db, ...onStaging, '--file', file, '--yes']);
  return true;
}

/** The build's config (what a bare `wrangler deploy` reads) must be the staging Worker on the staging database. */
function assertStagingBuild(target) {
  const redirect = join(ROOT, '.wrangler/deploy/config.json');
  if (!existsSync(redirect))
    throw new Error('staging: the build left no .wrangler/deploy/config.json; not deploying');
  const { configPath } = JSON.parse(readFileSync(redirect, 'utf8'));
  const built = JSON.parse(readFileSync(resolve(dirname(redirect), configPath), 'utf8'));
  const dbs = (built.d1_databases ?? []).map((d) => d.database_name);
  const dbOk = target.db ? dbs.length > 0 && dbs.every((n) => n === target.db) : dbs.length === 0;
  if (built.name !== target.worker || !dbOk)
    throw new Error(
      `staging: the build is ${built.name} on ${dbs.join(', ') || 'no database'}, not ${target.worker}; not deploying`,
    );
}

/** Whether the build writes its own wrangler config (@cloudflare/vite-plugin). */
function vitePluginBuild() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return '@cloudflare/vite-plugin' in { ...pkg.dependencies, ...pkg.devDependencies };
}

/** STAGING_SECRET_<NAME> values in the environment, as { NAME: value }. */
export function stagingSecrets(env) {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([k, v]) => k.startsWith('STAGING_SECRET_') && v)
      .map(([k, v]) => [k.slice('STAGING_SECRET_'.length), v]),
  );
}

function ensureSecrets(worker) {
  // Given on stdin, never on the command line or in the log
  for (const [name, value] of Object.entries(stagingSecrets(process.env)))
    wrangler(['secret', 'put', name, '--name', worker], { input: value });
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  if (!('better-auth' in { ...pkg.dependencies, ...pkg.devDependencies })) return;
  const names = new Set(
    parseJsonOutput(
      wrangler(['secret', 'list', '--name', worker, '--format', 'json'], { capture: true }),
    ).map((s) => s.name),
  );
  if (!names.has('BETTER_AUTH_SECRET'))
    wrangler(['secret', 'put', 'BETTER_AUTH_SECRET', '--name', worker], {
      input: randomBytes(32).toString('hex'),
    });
}

function summary(lines) {
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.error) {
    console.error(opts.error);
    return 1;
  }
  const name = CONFIGS.find((f) => existsSync(join(ROOT, f)));
  if (!name) throw new Error('No wrangler config.');
  const configPath = join(ROOT, name);
  const [prod, staging] = await readConfigs(configPath);
  const target = stagingTarget(prod, staging);
  if (target.error) {
    console.error(target.error);
    return 1;
  }
  if (opts.dryRun) {
    console.log(
      `[dry run] Worker ${target.worker}, database ${target.db ?? 'none'}, ${target.url ?? 'no BETTER_AUTH_URL'}${opts.reset ? ', reset' : ''}`,
    );
    return 0;
  }

  if (opts.reset && target.db) deleteDatabase(target.db);
  const restore = target.db ? writeDatabaseId(configPath, ensureDatabase(target.db)) : () => {};
  try {
    let seeded = false;
    if (target.db) {
      wrangler(['d1', 'migrations', 'apply', target.db, ...onStaging]);
      if (opts.reset || userCount(target.db) === 0) seeded = loadFakeData(target.db);
    }
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const build = pkg.scripts?.['staging:build'] ? 'staging:build' : 'build';
    run('npm', ['run', build], { env: { CLOUDFLARE_ENV: ENV } });
    if (vitePluginBuild()) {
      assertStagingBuild(target);
      wrangler(['deploy']);
    } else {
      // The config read above, with env.staging, is what this deploys
      wrangler(['deploy', '--env', ENV]);
    }
    ensureSecrets(target.worker);
    summary([
      `### Staging: ${target.url ?? target.worker}`,
      '',
      `- Code: ${process.env.GITHUB_SHA ?? 'this checkout'}`,
      `- Data: ${seeded ? 'fake data loaded fresh' : 'kept from the last deploy (Run workflow → reset to reload it)'}`,
      ...(target.url ? [`- Sign in as a test user: ${target.url}/dev/login`] : []),
    ]);
  } finally {
    restore();
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
