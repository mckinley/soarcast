import { sql } from 'drizzle-orm';
import { text, integer, sqliteTable, primaryKey, unique } from 'drizzle-orm/sqlite-core';

// NextAuth adapter tables
export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  image: text('image'),
});

export const accounts = sqliteTable('accounts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
});

export const sessions = sqliteTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

export const verificationTokens = sqliteTable(
  'verificationTokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    compositePk: primaryKey({ columns: [table.identifier, table.token] }),
  }),
);

// Application tables

// Global launch sites imported from external sources (ParaglidingEarth, etc.)
export const launchSites = sqliteTable('launch_sites', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  countryCode: text('country_code'),
  region: text('region'),
  latitude: text('latitude').notNull(), // real as text for precision
  longitude: text('longitude').notNull(),
  elevation: integer('elevation'), // meters (takeoff)
  landingElevation: integer('landing_elevation'), // meters
  orientations: text('orientations', { mode: 'json' }).$type<Record<string, number>>(), // {N: 2, NE: 1, ...}
  siteType: text('site_type'), // "takeoff", "landing", etc.
  flyingTypes: text('flying_types', { mode: 'json' }).$type<string[]>(), // ["paragliding", "hanggliding"]
  source: text('source').notNull(), // "paraglidingearth"
  sourceId: text('source_id').notNull().unique(), // external ID
  description: text('description'),
  landingLat: text('landing_lat'),
  landingLng: text('landing_lng'),
  landingDescription: text('landing_description'),
  maxWindSpeed: integer('max_wind_speed'), // km/h
  idealWindDirections: text('ideal_wind_directions', { mode: 'json' }).$type<number[]>(), // derived from orientations
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
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
      .references(() => users.id, { onDelete: 'cascade' }),
    siteId: text('site_id')
      .notNull()
      .references(() => launchSites.id, { onDelete: 'cascade' }),
    notes: text('notes'),
    customMaxWind: integer('custom_max_wind'), // km/h, overrides site default
    customIdealDirections: text('custom_ideal_directions', { mode: 'json' }).$type<number[]>(),
    notify: integer('notify', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    uniqueUserSite: unique().on(table.userId, table.siteId),
  }),
);

// User-created custom monitoring points
export const customSites = sqliteTable('custom_sites', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  latitude: text('latitude').notNull(), // Store as text to preserve precision
  longitude: text('longitude').notNull(),
  elevation: integer('elevation').notNull(), // meters
  maxWindSpeed: integer('max_wind_speed').notNull(), // km/h
  idealWindDirections: text('ideal_wind_directions', { mode: 'json' }).notNull().$type<number[]>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// Legacy sites table - kept for backward compatibility during transition
export const sites = sqliteTable('sites', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  latitude: text('latitude').notNull(), // Store as text to preserve precision
  longitude: text('longitude').notNull(),
  elevation: integer('elevation').notNull(), // meters
  idealWindDirections: text('idealWindDirections', { mode: 'json' }).notNull().$type<number[]>(),
  maxWindSpeed: integer('maxWindSpeed').notNull(), // km/h
  notes: text('notes'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// Forecasts cache - supports both launch_sites and custom_sites via discriminator
export const forecastsCache = sqliteTable(
  'forecasts_cache',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    siteId: text('siteId').notNull(), // ID reference (no FK, flexible)
    siteType: text('site_type').notNull(), // 'launch' | 'custom' | 'legacy'
    fetchDate: text('fetchDate').notNull(), // ISO date string (YYYY-MM-DD)
    data: text('data', { mode: 'json' }).notNull().$type<unknown>(),
    fetchedAt: integer('fetchedAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    // Unique constraint for cache key (one forecast per site per day)
    uniqueSiteDate: unique().on(table.siteId, table.siteType, table.fetchDate),
  }),
);

export const settings = sqliteTable('settings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  minScoreThreshold: integer('minScoreThreshold').notNull().default(70),
  daysAhead: integer('daysAhead').notNull().default(2),
  siteNotifications: text('siteNotifications', { mode: 'json' })
    .notNull()
    .default('{}')
    .$type<Record<string, boolean>>(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  keys: text('keys', { mode: 'json' }).notNull().$type<{ p256dh: string; auth: string }>(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// Export types for use in application code
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type LaunchSite = typeof launchSites.$inferSelect;
export type NewLaunchSite = typeof launchSites.$inferInsert;

export type UserFavoriteSite = typeof userFavoriteSites.$inferSelect;
export type NewUserFavoriteSite = typeof userFavoriteSites.$inferInsert;

export type CustomSite = typeof customSites.$inferSelect;
export type NewCustomSite = typeof customSites.$inferInsert;

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;

export type ForecastCache = typeof forecastsCache.$inferSelect;
export type NewForecastCache = typeof forecastsCache.$inferInsert;

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
