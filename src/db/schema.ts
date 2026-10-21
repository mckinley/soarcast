import { sql, relations } from 'drizzle-orm';
import { text, integer, real, sqliteTable, unique } from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';
import type { SiteGoal, SiteKind } from '../types';
import type { TrackRecord } from '../lib/track-record';
import type { FlownDay } from '../lib/flown-days';

// Better Auth's tables live in auth-schema.ts; app tables reference user.id.
export * from './auth-schema';

// Application tables

// Global launch sites imported from pgsites API
export const launchSites = sqliteTable('launch_sites', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  countryCode: text('country_code'),
  region: text('region'),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  altitude: integer('altitude'), // meters (takeoff)
  landingAltitude: integer('landing_altitude'), // meters
  landingLatitude: real('landing_latitude'),
  landingLongitude: real('landing_longitude'),
  // Wind direction ratings (0=none, 1=ok, 2=ideal) — replaces orientations JSON
  windN: integer('wind_n').notNull().default(0),
  windNe: integer('wind_ne').notNull().default(0),
  windE: integer('wind_e').notNull().default(0),
  windSe: integer('wind_se').notNull().default(0),
  windS: integer('wind_s').notNull().default(0),
  windSw: integer('wind_sw').notNull().default(0),
  windW: integer('wind_w').notNull().default(0),
  windNw: integer('wind_nw').notNull().default(0),
  // Flying type flags — replaces flyingTypes JSON
  isParagliding: integer('is_paragliding', { mode: 'boolean' }).notNull().default(false),
  isHanggliding: integer('is_hanggliding', { mode: 'boolean' }).notNull().default(false),
  // Paraglidingearth.com's tags for what the site gives (src/lib/site-goals.ts)
  isThermal: integer('is_thermal', { mode: 'boolean' }).notNull().default(false),
  isSoaring: integer('is_soaring', { mode: 'boolean' }).notNull().default(false),
  isXc: integer('is_xc', { mode: 'boolean' }).notNull().default(false),
  isHike: integer('is_hike', { mode: 'boolean' }).notNull().default(false),
  siteType: text('site_type'), // "takeoff", "landing", etc.
  source: text('source').notNull(), // "pgsites"
  pgsitesId: text('pgsites_id').notNull().unique(), // UUID from pgsites API
  description: text('description'),
  landingDescription: text('landing_description'),
  maxWindSpeed: integer('max_wind_speed'), // km/h
  pgeLink: text('pge_link'), // ParaglidingEarth URL
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// User favorites of launch sites with optional customizations
export const userFavoriteSites = sqliteTable(
  'user_favorite_sites',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    siteId: text('site_id')
      .notNull()
      .references(() => launchSites.id, { onDelete: 'cascade' }),
    notes: text('notes'),
    customMaxWind: integer('custom_max_wind'), // km/h, overrides site default
    customIdealDirections: text('custom_ideal_directions', { mode: 'json' }).$type<number[]>(),
    // The pilot's own say on what the site gives and what they want from it;
    // null uses the site's tags and the default goal for them
    siteKind: text('site_kind').$type<SiteKind>(),
    goal: text('goal').$type<SiteGoal>(),
    notify: integer('notify', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    uniqueUserSite: unique().on(table.userId, table.siteId),
  }),
);

// Sites a user pinned themselves (unlisted launches); private to that user
export const customSites = sqliteTable('custom_sites', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  latitude: text('latitude').notNull(), // Store as text to preserve precision
  longitude: text('longitude').notNull(),
  elevation: integer('elevation').notNull(), // meters
  maxWindSpeed: integer('max_wind_speed').notNull(), // km/h
  // Directions (degrees, 45° steps) the launch works well in, and ones it
  // works in only cross; the same split as launch_sites' 2 and 1 ratings.
  idealWindDirections: text('ideal_wind_directions', { mode: 'json' }).notNull().$type<number[]>(),
  okWindDirections: text('ok_wind_directions', { mode: 'json' })
    .notNull()
    .default(sql`'[]'`)
    .$type<number[]>(),
  siteKind: text('site_kind').$type<SiteKind>(), // null: not said
  goal: text('goal').$type<SiteGoal>(), // null: safe launch is enough
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Unused since every page reads atmospheric_profiles_cache; kept until a later
// migration drops it, so code still running during a deploy keeps working.
export const forecastsCache = sqliteTable(
  'forecasts_cache',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    siteId: text('site_id').notNull(), // ID reference (no FK, flexible)
    siteType: text('site_type').notNull(), // 'launch' | 'custom' | 'legacy'
    fetchDate: text('fetch_date').notNull(), // ISO date string (YYYY-MM-DD)
    data: text('data', { mode: 'json' }).notNull().$type<unknown>(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    // Unique constraint for cache key (one forecast per site per day)
    uniqueSiteDate: unique().on(table.siteId, table.siteType, table.fetchDate),
  }),
);

/**
 * Per-site notification preferences
 */
export interface SiteNotificationPreferences {
  enabled?: boolean; // Default true
  notifyTime?: 'morning' | 'evening' | 'both'; // Default 'both'
}

export const settings = sqliteTable('settings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Unused since alerts follow each site's goal; kept so migrations stay additive
  minScoreThreshold: integer('min_score_threshold').notNull().default(70),
  daysAhead: integer('days_ahead').notNull().default(2),
  siteNotifications: text('site_notifications', { mode: 'json' })
    .notNull()
    .default('{}')
    .$type<Record<string, SiteNotificationPreferences>>(),
  morningDigestEnabled: integer('morning_digest_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  morningDigestTime: text('morning_digest_time').default('08:00'), // HH:MM format in user's local timezone
  // IANA zone from the user's browser; alerts go out by local time (src/lib/alert-schedule.ts)
  timeZone: text('time_zone'),
  // Unused since the welcome popup was removed; kept so migrations stay additive
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' })
    .notNull()
    .default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  keys: text('keys', { mode: 'json' }).notNull().$type<{ p256dh: string; auth: string }>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Atmospheric profiles cache - separate from simple forecasts, 3-hour TTL
export const atmosphericProfilesCache = sqliteTable(
  'atmospheric_profiles_cache',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    locationKey: text('location_key').notNull(), // "lat,lng" rounded to 2 decimals (~1km precision)
    fetchDate: text('fetch_date').notNull(), // ISO date string (YYYY-MM-DD)
    data: text('data', { mode: 'json' }).notNull().$type<unknown>(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    uniqueLocationDate: unique().on(table.locationKey, table.fetchDate),
  }),
);

// A forecast's track record at an airport (src/lib/track-record.ts), shared by
// every site near it and recomputed monthly.
export const forecastTrackRecords = sqliteTable('forecast_track_records', {
  stationId: text('station_id').primaryKey(), // ICAO code
  record: text('record', { mode: 'json' }).notNull().$type<TrackRecord>(),
  computedAt: integer('computed_at', { mode: 'timestamp' }).notNull(),
});

// Which airport a place's track record comes from; stationId null when no
// airport within reach has enough reports.
export const trackRecordLocations = sqliteTable('track_record_locations', {
  locationKey: text('location_key').primaryKey(), // "lat,lng" rounded to 2 decimals
  stationId: text('station_id'),
  distanceKm: real('distance_km'),
  checkedAt: integer('checked_at', { mode: 'timestamp' }).notNull(),
});

// Days pilots flew from a launch, from Syncing Pilots (app/lib/flown-days.server.ts),
// refetched every few hours.
export const flownDaysCache = sqliteTable('flown_days', {
  key: text('key').primaryKey(), // flownKey() in src/lib/flown-days.ts
  fromDate: text('from_date').notNull(),
  toDate: text('to_date').notNull(),
  days: text('days', { mode: 'json' }).notNull().$type<FlownDay[]>(),
  fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull(),
});

// A site's past days rated by the engine on archived forecasts, written by
// the "Season build" workflow (scripts/seasons/build.ts) and summed into
// months on site pages and the Year page (src/lib/seasons.ts).
export const siteSeasons = sqliteTable('site_seasons', {
  // "<siteRef>|<launchProfileKey>": one row per launch and the way it's rated
  key: text('key').primaryKey(),
  // "pg:<pgsites id>" for listed sites, "custom:<custom_sites.id>" for your own
  siteRef: text('site_ref').notNull(),
  // Listed sites only (custom sites stay private to their table)
  name: text('name'),
  countryCode: text('country_code'),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  // Slug in src/lib/destinations.ts when the site is a destination
  destination: text('destination'),
  // encodeSeasonDays(): one entry per past day
  days: text('days').notNull(),
  fromDate: text('from_date').notNull(),
  toDate: text('to_date').notNull(),
  builtAt: integer('built_at', { mode: 'timestamp' }).notNull(),
  // ENGINE_VERSION the days were rated with; an older one is rated again
  engineVersion: integer('engine_version').notNull().default(0),
});

// Export types for use in application code
export type LaunchSite = typeof launchSites.$inferSelect;
export type NewLaunchSite = typeof launchSites.$inferInsert;

export type UserFavoriteSite = typeof userFavoriteSites.$inferSelect;
export type NewUserFavoriteSite = typeof userFavoriteSites.$inferInsert;

export type CustomSite = typeof customSites.$inferSelect;
export type NewCustomSite = typeof customSites.$inferInsert;

export type ForecastCache = typeof forecastsCache.$inferSelect;
export type NewForecastCache = typeof forecastsCache.$inferInsert;

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;

export type SiteSeason = typeof siteSeasons.$inferSelect;

export type AtmosphericProfileCache = typeof atmosphericProfilesCache.$inferSelect;
export type NewAtmosphericProfileCache = typeof atmosphericProfilesCache.$inferInsert;

// Drizzle relations for query features
export const launchSitesRelations = relations(launchSites, ({ many }) => ({
  favorites: many(userFavoriteSites),
}));

export const userFavoriteSitesRelations = relations(userFavoriteSites, ({ one }) => ({
  user: one(user, {
    fields: [userFavoriteSites.userId],
    references: [user.id],
  }),
  site: one(launchSites, {
    fields: [userFavoriteSites.siteId],
    references: [launchSites.id],
  }),
}));

// Small operational key/value state: the last alerts run and the health
// check's last result (worker.ts scheduled, /api/health).
export const appState = sqliteTable('app_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});
