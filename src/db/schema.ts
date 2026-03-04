import { sql } from 'drizzle-orm';
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';

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
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sessionToken: text('sessionToken').notNull().unique(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

export const verificationTokens = sqliteTable('verificationTokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull().unique(),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

// Application tables
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
  idealWindDirections: text('idealWindDirections', { mode: 'json' })
    .notNull()
    .$type<number[]>(),
  maxWindSpeed: integer('maxWindSpeed').notNull(), // km/h
  notes: text('notes'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const forecastsCache = sqliteTable('forecasts_cache', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  siteId: text('siteId')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  fetchDate: text('fetchDate').notNull(), // ISO date string (YYYY-MM-DD)
  data: text('data', { mode: 'json' }).notNull().$type<unknown>(),
  fetchedAt: integer('fetchedAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
});

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
  keys: text('keys', { mode: 'json' })
    .notNull()
    .$type<{ p256dh: string; auth: string }>(),
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

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;

export type ForecastCache = typeof forecastsCache.$inferSelect;
export type NewForecastCache = typeof forecastsCache.$inferInsert;

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
