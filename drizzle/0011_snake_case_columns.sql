-- Rename all camelCase DB columns to snake_case for cross-project consistency.
-- Auth tables (users, accounts, sessions, verificationTokens) are managed by
-- Better Auth — do NOT rename those columns.

-- ── Legacy sites table ──────────────────────────────────────────────────────
ALTER TABLE sites RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE sites RENAME COLUMN "idealWindDirections" TO "ideal_wind_directions";--> statement-breakpoint
ALTER TABLE sites RENAME COLUMN "maxWindSpeed" TO "max_wind_speed";--> statement-breakpoint
ALTER TABLE sites RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE sites RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint

-- ── Forecasts cache ─────────────────────────────────────────────────────────
ALTER TABLE forecasts_cache RENAME COLUMN "siteId" TO "site_id";--> statement-breakpoint
ALTER TABLE forecasts_cache RENAME COLUMN "fetchDate" TO "fetch_date";--> statement-breakpoint
ALTER TABLE forecasts_cache RENAME COLUMN "fetchedAt" TO "fetched_at";--> statement-breakpoint
ALTER TABLE forecasts_cache RENAME COLUMN "expiresAt" TO "expires_at";--> statement-breakpoint

-- ── Settings ────────────────────────────────────────────────────────────────
ALTER TABLE settings RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE settings RENAME COLUMN "minScoreThreshold" TO "min_score_threshold";--> statement-breakpoint
ALTER TABLE settings RENAME COLUMN "daysAhead" TO "days_ahead";--> statement-breakpoint
ALTER TABLE settings RENAME COLUMN "siteNotifications" TO "site_notifications";--> statement-breakpoint
ALTER TABLE settings RENAME COLUMN "morningDigestEnabled" TO "morning_digest_enabled";--> statement-breakpoint
ALTER TABLE settings RENAME COLUMN "morningDigestTime" TO "morning_digest_time";--> statement-breakpoint
ALTER TABLE settings RENAME COLUMN "onboardingCompleted" TO "onboarding_completed";--> statement-breakpoint
ALTER TABLE settings RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint

-- ── Push subscriptions ──────────────────────────────────────────────────────
ALTER TABLE push_subscriptions RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE push_subscriptions RENAME COLUMN "createdAt" TO "created_at";
