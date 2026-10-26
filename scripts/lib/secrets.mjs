// secrets: credentials for an app's own scripts (seeding, ops, admin calls).
//
// One rule everywhere: process.env first, then the gitignored .dev.vars at the
// repo root (or .env, where nothing runs on Workers). The same script then works
// on a laptop, where values live in .dev.vars, and in a Claude cloud session or
// GitHub Actions, where the environment sets them. An empty value counts as
// unset, so a copied example file doesn't satisfy anything.
//
// Nothing here prints a value. Errors name the variable and where to set it.
//
// From the pjmgmt env-vars standard (mckinley/pjmgmt,
// scripts/automations/templates/secrets.mjs). Change it there, then copy it to
// each app's scripts/lib/secrets.mjs.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repo root: the nearest folder above this file holding .git (a bundler may move the file). */
function findRoot() {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    const up = dirname(dir)
    if (up === dir) return process.cwd()
    dir = up
  }
}
const ROOT = findRoot()
const FILES = ['.dev.vars', '.env']

/** KEY=value lines as an object. Quotes around a value are dropped; # lines are comments. */
export function parseDotenv(text) {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2')
  }
  return out
}

let cached = null

/** The values in .dev.vars, then .env, at root; the first file to set a name wins. */
export function fileValues(root = ROOT) {
  if (root === ROOT && cached) return cached
  const values = {}
  for (const name of FILES) {
    const file = join(root, name)
    if (!existsSync(file)) continue
    for (const [k, v] of Object.entries(parseDotenv(readFileSync(file, 'utf8')))) values[k] ??= v
  }
  if (root === ROOT) cached = values
  return values
}

/** The first non-empty value for name: env, then the files. Returns { value, source } or null. */
export function lookup(name, env = process.env, files = fileValues()) {
  const fromEnv = env[name]?.trim()
  if (fromEnv) return { value: fromEnv, source: 'environment' }
  const fromFile = files[name]?.trim()
  if (fromFile) return { value: fromFile, source: 'local file' }
  return null
}

/** name's value, or null when it isn't set anywhere. */
export function secret(name) {
  return lookup(name)?.value ?? null
}

/** name's value; throws, naming the variable (never a value), when it isn't set. */
export function requireSecret(name) {
  const found = lookup(name)
  if (found) return found.value
  throw new Error(
    `${name} is not set. Add it to .dev.vars (see .dev.vars.example) or set it in the environment.`
  )
}
