#!/usr/bin/env node
// make-admin: give a user the admin role, or list who has it.
//
//   npm run make-admin -- you@example.com          # local D1
//   npm run make-admin -- you@example.com --prod   # production D1
//   npm run make-admin -- --list [--prod]          # who is admin
//   --dry-run   print the target database and SQL, change nothing
//   --mask      show only the start of each email (for public logs)
//
// The user must have signed in once, which creates their row. The database is
// the D1 binding DB in the wrangler config, read with wrangler's own reader.
// The "Make admin" workflow runs this against production from the Actions tab.
//
// From the pjmgmt admin-section standard (mckinley/pjmgmt,
// scripts/automations/templates/make-admin.mjs). Change it there, then copy it
// into each app with scripts/automations/add-make-admin.js.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const BINDING = 'DB'
const CONFIGS = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']
// No quotes, spaces or semicolons, so the address can go into SQL as a literal
const EMAIL = /^[^\s'";@]+@[^\s'";@]+\.[^\s'";@]+$/

const USAGE = `Usage: npm run make-admin -- <email> [--prod] [--dry-run] [--mask]
       npm run make-admin -- --list [--prod] [--mask]`

/** Parsed arguments, or { error } */
export function parseArgs(argv) {
  const opts = { email: null, list: false, prod: false, dryRun: false, mask: false }
  for (const arg of argv) {
    if (arg === '--list') opts.list = true
    else if (arg === '--prod' || arg === '--remote') opts.prod = true
    else if (arg === '--local') opts.prod = false
    else if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--mask') opts.mask = true
    else if (arg === '--no-mask') opts.mask = false
    else if (arg.startsWith('-')) return { error: `Unknown option: ${arg}` }
    else if (opts.email) return { error: 'Give one email.' }
    else opts.email = arg.trim()
  }
  if (opts.list && opts.email) return { error: 'Give an email or --list, not both.' }
  if (!opts.list && !opts.email) return { error: 'Give an email, or --list.' }
  if (opts.email && !EMAIL.test(opts.email)) return { error: `Not an email address: ${opts.email}` }
  return opts
}

/** "bronson@example.com" → "br***@example.com" */
export function maskEmail(email) {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`
}

export function userSql(email) {
  return `SELECT id, email, role FROM user WHERE lower(email) = lower('${email}');`
}

export function promoteSql(id) {
  return `UPDATE user SET role = 'admin' WHERE id = '${id.replaceAll("'", "''")}';`
}

export const LIST_SQL = `SELECT email FROM user WHERE role = 'admin' ORDER BY email;`

function findConfig(root) {
  const name = CONFIGS.find((f) => existsSync(join(root, f)))
  return name ? join(root, name) : null
}

async function databaseName(configPath) {
  // Wrangler logs while reading its config; keep stdout for our own output
  const log = console.log
  console.log = (...args) => process.stderr.write(args.join(' ') + '\n')
  try {
    const { unstable_readConfig } = await import('wrangler')
    const config = unstable_readConfig({ config: configPath })
    const dbs = (config.d1_databases ?? []).filter((db) => db.binding === BINDING)
    return dbs.length === 1 ? (dbs[0].database_name ?? null) : null
  } finally {
    console.log = log
  }
}

/**
 * The rows in `wrangler d1 execute --json` output. Wrangler can print notes
 * before the JSON (behind a proxy, for one), so it starts at the first line
 * that opens an array or object.
 */
export function parseRows(stdout) {
  const start = stdout.search(/^[[{]/m)
  if (start < 0) throw new Error(`wrangler printed no JSON: ${stdout.trim().slice(0, 200)}`)
  const out = JSON.parse(stdout.slice(start))
  return (Array.isArray(out) ? out : [out]).flatMap((r) => r.results ?? [])
}

/** Runs one statement through wrangler and returns its rows. */
function execute(root, db, prod, sql) {
  const args = ['wrangler', 'd1', 'execute', db, prod ? '--remote' : '--local', '--json', '--command', sql]
  const run = spawnSync('npx', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (run.status !== 0) throw new Error(`wrangler d1 execute failed (exit ${run.status})`)
  return parseRows(run.stdout)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.error) {
    console.error(`${opts.error}\n${USAGE}`)
    return 1
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const configPath = findConfig(root)
  const db = configPath ? await databaseName(configPath) : null
  if (!db) {
    console.error(`No D1 database bound as ${BINDING} in ${configPath ?? 'a wrangler config'}. Nothing was changed.`)
    return 1
  }
  const show = (email) => (opts.mask ? maskEmail(email) : email)
  const target = opts.prod ? 'production' : 'local'
  console.log(`Database: ${db} (${target})`)

  if (opts.list) {
    if (opts.dryRun) {
      console.log(`[dry run] ${LIST_SQL}`)
      return 0
    }
    const admins = execute(root, db, opts.prod, LIST_SQL)
    console.log(`${admins.length} admin${admins.length === 1 ? '' : 's'}${admins.length ? ':' : '.'}`)
    for (const a of admins) console.log(`  ${show(a.email)}`)
    return 0
  }

  if (opts.dryRun) {
    console.log(`[dry run] ${userSql(opts.email)}`)
    console.log(`[dry run] ${promoteSql('<that user id>')}`)
    return 0
  }
  const users = execute(root, db, opts.prod, userSql(opts.email))
  if (users.length === 0) {
    console.error(`No user ${show(opts.email)} in the ${target} database. Sign in once first, then run this again.`)
    return 1
  }
  const user = users[0]
  if (user.role === 'admin') {
    console.log(`${show(user.email)} is already an admin.`)
    return 0
  }
  execute(root, db, opts.prod, promoteSql(user.id))
  const [after] = execute(root, db, opts.prod, userSql(opts.email))
  if (after?.role !== 'admin') {
    console.error(`The update ran, but ${show(user.email)} is still "${after?.role}".`)
    return 1
  }
  console.log(`${show(user.email)} is now an admin.`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }
  )
}
