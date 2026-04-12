-- Convert all remaining timestamp columns from milliseconds to seconds
-- for consistency with launch_sites, user_favorite_sites, custom_sites,
-- and the cross-project convention (pgsites, syncing-pilots).
-- Auth tables (users, sessions, verificationTokens) are managed by Better Auth — leave them.

-- 1. Legacy sites table
UPDATE sites SET
  "createdAt" = "createdAt" / 1000,
  "updatedAt" = "updatedAt" / 1000
WHERE "createdAt" > 2000000000;--> statement-breakpoint

-- 2. Forecasts cache
UPDATE forecasts_cache SET
  "fetchedAt" = "fetchedAt" / 1000,
  "expiresAt" = "expiresAt" / 1000
WHERE "fetchedAt" > 2000000000;--> statement-breakpoint

-- 3. Settings
UPDATE settings SET
  "updatedAt" = "updatedAt" / 1000
WHERE "updatedAt" > 2000000000;--> statement-breakpoint

-- 4. Push subscriptions
UPDATE push_subscriptions SET
  "createdAt" = "createdAt" / 1000
WHERE "createdAt" > 2000000000;--> statement-breakpoint

-- 5. Atmospheric profiles cache
UPDATE atmospheric_profiles_cache SET
  fetched_at = fetched_at / 1000,
  expires_at = expires_at / 1000
WHERE fetched_at > 2000000000;
