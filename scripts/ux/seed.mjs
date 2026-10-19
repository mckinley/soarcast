// Seeds a local D1 for the UX walkthrough: two test pilots (one set up, one
// brand new), real launch sites copied from pgsites, favorites, a custom site
// and settings. Writes seed.sql and the set-up pilot's signed session cookie.
//
//   node scripts/ux/seed.mjs <pgsites-rows.json> <out-dir>
//
// BETTER_AUTH_SECRET must match the local Worker's .dev.vars.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [rowsFile, outDir] = process.argv.slice(2);
const secret = process.env.BETTER_AUTH_SECRET;
if (!rowsFile || !outDir || !secret) {
  console.error('usage: BETTER_AUTH_SECRET=… node scripts/ux/seed.mjs <rows.json> <out-dir>');
  process.exit(1);
}

// `wrangler d1 execute --json` prints [{ results: [...] }]
const raw = JSON.parse(fs.readFileSync(rowsFile, 'utf8'));
const sites = Array.isArray(raw) ? raw.flatMap((r) => r.results ?? []) : raw.results;
if (!sites?.length) throw new Error('No pgsites rows to seed');

const q = (v) =>
  v === null || v === undefined
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : typeof v === 'boolean'
        ? v
          ? '1'
          : '0'
        : `'${String(v).replace(/'/g, "''")}'`;

const slugify = (name, id) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}--${id}`;

const now = Date.now();
const nowSec = Math.floor(now / 1000);
const sql = [];

const pilot = { id: 'ux-pilot', name: 'Test Pilot', email: 'pilot@example.com' };
const newbie = { id: 'ux-newbie', name: 'New Pilot', email: 'newbie@example.com' };
for (const u of [pilot, newbie]) {
  sql.push(
    `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (${q(u.id)}, ${q(u.name)}, ${q(u.email)}, 1, ${now}, ${now});`,
  );
}

const sessions = {};
for (const u of [pilot, newbie]) {
  const token = crypto.randomBytes(24).toString('base64url');
  sql.push(
    `INSERT INTO session (id, expires_at, token, user_id, created_at, updated_at) VALUES (${q(`${u.id}-session`)}, ${now + 7 * 86400_000}, ${q(token)}, ${q(u.id)}, ${now}, ${now});`,
  );
  // Better Auth's signed cookie: token.base64(HMAC-SHA256(secret, token))
  const sig = crypto.createHmac('sha256', secret).update(token).digest('base64');
  sessions[u.id] = encodeURIComponent(`${token}.${sig}`);
}

const siteSlugs = [];
for (const s of sites) {
  const localId = `ux-site-${s.pge_site_id}`;
  const slug = slugify(s.name, s.id);
  siteSlugs.push({ name: s.name, slug, localId });
  sql.push(
    `INSERT INTO launch_sites (id, name, slug, country_code, latitude, longitude, altitude, landing_altitude, landing_latitude, landing_longitude, wind_n, wind_ne, wind_e, wind_se, wind_s, wind_sw, wind_w, wind_nw, is_paragliding, is_hanggliding, site_type, source, pgsites_id, description, landing_description, pge_link, last_synced_at) VALUES (${[
      localId,
      s.name,
      slug,
      s.country_code,
      s.takeoff_latitude ?? s.latitude,
      s.takeoff_longitude ?? s.longitude,
      s.takeoff_altitude ?? s.altitude,
      s.landing_altitude,
      s.landing_latitude,
      s.landing_longitude,
      s.wind_n ?? 0,
      s.wind_ne ?? 0,
      s.wind_e ?? 0,
      s.wind_se ?? 0,
      s.wind_s ?? 0,
      s.wind_sw ?? 0,
      s.wind_w ?? 0,
      s.wind_nw ?? 0,
      s.is_paragliding ?? 1,
      s.is_hanggliding ?? 0,
      'takeoff',
      'pgsites',
      s.id,
      s.description,
      null,
      s.pge_link,
      nowSec,
    ]
      .map(q)
      .join(', ')});`,
  );
  sql.push(
    `INSERT INTO user_favorite_sites (id, user_id, site_id, notify) VALUES (${q(`fav-${localId}`)}, ${q(pilot.id)}, ${q(localId)}, 1);`,
  );
}

// A hike-and-fly peak that isn't listed: Granite Mountain above Snoqualmie Pass
const customId = '00000000-0000-4000-8000-00000000c0de';
sql.push(
  `INSERT INTO custom_sites (id, user_id, name, latitude, longitude, elevation, max_wind_speed, ideal_wind_directions, ok_wind_directions, notes) VALUES (${q(customId)}, ${q(pilot.id)}, 'Granite Mountain', '47.3979', '-121.4864', 1716, 25, '[180,225]', '[270]', 'Hike up the lookout trail; launch on the south meadow below the lookout.');`,
);

sql.push(
  `INSERT INTO settings (id, user_id, min_score_threshold, days_ahead, site_notifications, morning_digest_enabled, morning_digest_time, time_zone, onboarding_completed) VALUES ('ux-settings', ${q(pilot.id)}, 70, 2, '{}', 1, '07:00', 'America/Los_Angeles', 1);`,
);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'seed.sql'), sql.join('\n') + '\n');
fs.writeFileSync(
  path.join(outDir, 'seed.json'),
  JSON.stringify({ sessions, sites: siteSlugs, customSiteId: customId }, null, 2),
);
console.log(`Seeded ${sites.length} sites: ${siteSlugs.map((s) => s.name).join(', ')}`);
