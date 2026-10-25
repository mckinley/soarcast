#!/usr/bin/env node
// staging-seed: print the SQL that loads the staging copy's fake data
// (docs/staging.md). scripts/staging.mjs runs it into the staging database when
// that database has no users yet, or on a reset.
//
//   npm run --silent staging:seed > seed.sql
//
// One test user per kind of pilot, named for it, all @example.test, with
// flying areas, followed sites and a private site. The followed sites are real
// launches that pgsites' staging copy also holds (its scripts/staging-sites.json),
// so their forecasts and pages work; each page load refreshes their copy from
// there. Forecasts, seasons and ensembles aren't seeded: pages fetch the
// forecast themselves, and the season build only runs in production.

const now = Math.floor(Date.now() / 1000);
const DAY = 86400;

const q = (v) =>
  v === null || v === undefined
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : typeof v === 'boolean'
        ? v
          ? '1'
          : '0'
        : `'${String(v).replaceAll("'", "''")}'`;

function insert(table, rows) {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  return rows
    .map(
      (r) =>
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => q(r[c])).join(', ')});`,
    )
    .join('\n');
}

/** siteSlug in src/lib/site-slug.ts, which gives the same for these plain names */
const slug = (name, id) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${id.slice(0, 8)}`;

// [id, name, role, time zone, morning digest, wider margins in big mountains]
const USERS = [
  ['u-ada', 'Ada Admin', 'admin', 'America/Los_Angeles', false, false],
  ['u-pia', 'Pia Pilot', 'user', 'America/Los_Angeles', true, false],
  ['u-toni', 'Toni Traveler', 'user', 'Europe/Zurich', false, true],
  ['u-nina', 'Nina Newbie', 'user', null, false, false],
];

// pgsites staging's sites: [pgsites id, name, country, lat, lng, m, winds N..NW, thermal, soaring, xc, hike]
const SITES = [
  [
    '22ee6c89-ef7d-475c-a1fd-ac83f456fc04',
    'Tiger Mountain',
    'US',
    47.4995,
    -122.009,
    543,
    [2, 1, 0, 1, 2, 2, 2, 2],
    1,
    1,
    0,
    1,
  ],
  [
    '68981e3d-c82b-4d13-9ef5-f6be211e7a7d',
    'Mt. Si',
    'US',
    47.5053,
    -121.744,
    916,
    [0, 0, 0, 0, 0, 0, 0, 0],
    0,
    0,
    0,
    0,
  ],
  [
    '8306d694-c9d8-429f-a521-40b0196e5fbf',
    'Annecy - Planfait',
    'FR',
    45.8532,
    6.22299,
    956,
    [0, 0, 0, 0, 0, 2, 2, 2],
    1,
    1,
    1,
    0,
  ],
  [
    '60327467-5922-448b-8f5f-45e5b21936fc',
    'Montmin (Col de la Forclaz)',
    'FR',
    45.8142,
    6.247,
    1265,
    [2, 0, 0, 0, 0, 0, 1, 2],
    1,
    0,
    1,
    0,
  ],
  [
    '7c199cbd-b94e-4a21-af83-22be4274bdb2',
    'Sarangkot',
    'NP',
    28.2436,
    83.9515,
    1438,
    [0, 0, 1, 2, 1, 0, 0, 0],
    1,
    0,
    1,
    0,
  ],
];

// [id, user, name, alerts on]
const AREAS = [
  ['a-pia-home', 'u-pia', 'Seattle', true],
  ['a-toni-annecy', 'u-toni', 'Annecy trip', true],
  ['a-toni-nepal', 'u-toni', 'Nepal', false],
];

// [user, site name, area, notify, notes, own directions (degrees)]
const FAVORITES = [
  ['u-pia', 'Tiger Mountain', 'a-pia-home', true, 'Poo Poo Point, the north launch', null],
  ['u-pia', 'Mt. Si', 'a-pia-home', false, null, [225, 270]],
  ['u-toni', 'Annecy - Planfait', 'a-toni-annecy', true, null, null],
  ['u-toni', 'Montmin (Col de la Forclaz)', 'a-toni-annecy', true, null, null],
  ['u-toni', 'Sarangkot', 'a-toni-nepal', false, 'December, with the school', null],
];

export function seedSql() {
  const ms = (secondsAgo) => (now - secondsAgo) * 1000;
  const users = USERS.map(([id, name, role], i) => ({
    id,
    name,
    email: `${id.slice(2)}@example.test`,
    email_verified: true,
    image: null,
    role,
    created_at: ms((60 - i) * DAY),
    updated_at: ms((60 - i) * DAY),
  }));
  const settings = USERS.map(([id, , , zone, digest, margins]) => ({
    id: `s-${id.slice(2)}`,
    user_id: id,
    morning_digest_enabled: digest,
    time_zone: zone,
    mountain_margins: margins,
    updated_at: now - 30 * DAY,
  }));
  const sites = SITES.map(
    ([pgsitesId, name, country, lat, lng, alt, w, thermal, soaring, xc, hike], i) => ({
      id: `ls-${i + 1}`,
      name,
      slug: slug(name, pgsitesId),
      country_code: country,
      latitude: lat,
      longitude: lng,
      altitude: alt,
      wind_n: w[0],
      wind_ne: w[1],
      wind_e: w[2],
      wind_se: w[3],
      wind_s: w[4],
      wind_sw: w[5],
      wind_w: w[6],
      wind_nw: w[7],
      is_paragliding: true,
      is_thermal: !!thermal,
      is_soaring: !!soaring,
      is_xc: !!xc,
      is_hike: !!hike,
      source: 'pgsites',
      pgsites_id: pgsitesId,
      origin: 'pge',
      // Never synced: the first page load copies the rest from pgsites staging
      last_synced_at: null,
      created_at: now - 40 * DAY,
      updated_at: now - 40 * DAY,
    }),
  );
  const siteId = new Map(sites.map((s) => [s.name, s.id]));
  const areas = AREAS.map(([id, user, name, alerts], i) => ({
    id,
    user_id: user,
    name,
    alerts,
    created_at: now - (30 - i) * DAY,
  }));
  const favorites = FAVORITES.map(([user, site, area, notify, notes, dirs], i) => ({
    id: `f-${i + 1}`,
    user_id: user,
    site_id: siteId.get(site),
    notes,
    custom_ideal_directions: dirs ? JSON.stringify(dirs) : null,
    notify,
    area_id: area,
    created_at: now - (25 - i) * DAY,
  }));
  const customSites = [
    {
      id: 'c-pia-1',
      user_id: 'u-pia',
      name: "Pia's backyard hill (private)",
      latitude: '47.5301',
      longitude: '-121.8268',
      elevation: 420,
      max_wind_speed: 0,
      ideal_wind_directions: JSON.stringify([270, 315]),
      ok_wind_directions: JSON.stringify([225]),
      site_kind: 'ridge',
      goal: 'soar',
      notes: 'Only in a steady westerly',
      shared_site_id: null,
      area_id: 'a-pia-home',
      created_at: now - 10 * DAY,
      updated_at: now - 10 * DAY,
    },
  ];

  const order = [
    ['user', users],
    ['settings', settings],
    ['launch_sites', sites],
    ['site_areas', areas],
    ['user_favorite_sites', favorites],
    ['custom_sites', customSites],
  ];
  return [
    '-- Staging fake data (scripts/staging-seed.mjs). Replaces what is there.',
    'DELETE FROM push_subscriptions;',
    'DELETE FROM session;',
    'DELETE FROM account;',
    'DELETE FROM verification;',
    ...[...order].reverse().map(([t]) => `DELETE FROM ${t};`),
    ...order.map(([t, rows]) => insert(t, rows)),
    '',
  ].join('\n');
}

process.stdout.write(seedSql());
