import { sql, relations } from 'drizzle-orm';
import { text, integer, real, sqliteTable, primaryKey, unique } from 'drizzle-orm/sqlite-core';

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
      .references(() => users.id, { onDelete: 'cascade' }),
    siteId: text('site_id')
      .notNull()
      .references(() => launchSites.id, { onDelete: 'cascade' }),
    notes: text('notes'),
    customMaxWind: integer('custom_max_wind'), // km/h, overrides site default
    customIdealDirections: text('custom_ideal_directions', { mode: 'json' }).$type<number[]>(),
    notify: integer('notify', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
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
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
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

/**
 * Per-site notification preferences
 */
export interface SiteNotificationPreferences {
  enabled?: boolean; // Default true
  minRating?: 'Good' | 'Great' | 'Epic'; // Minimum rating to trigger notification
  notifyTime?: 'morning' | 'evening' | 'both'; // Default 'both'
}

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
    .$type<Record<string, SiteNotificationPreferences>>(),
  morningDigestEnabled: integer('morningDigestEnabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  morningDigestTime: text('morningDigestTime').default('08:00'), // HH:MM format in user's local timezone
  onboardingCompleted: integer('onboardingCompleted', { mode: 'boolean' }).notNull().default(false),
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
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    uniqueLocationDate: unique().on(table.locationKey, table.fetchDate),
  }),
);

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

export type AtmosphericProfileCache = typeof atmosphericProfilesCache.$inferSelect;
export type NewAtmosphericProfileCache = typeof atmosphericProfilesCache.$inferInsert;

// Drizzle relations for query features
export const launchSitesRelations = relations(launchSites, ({ many }) => ({
  favorites: many(userFavoriteSites),
}));

export const userFavoriteSitesRelations = relations(userFavoriteSites, ({ one }) => ({
  user: one(users, {
    fields: [userFavoriteSites.userId],
    references: [users.id],
  }),
  site: one(launchSites, {
    fields: [userFavoriteSites.siteId],
    references: [launchSites.id],
  }),
}));
