-- Better Auth tables for SoarCast
-- Run this against Turso: turso db shell soarcast < scripts/better-auth-migration.sql

-- Better Auth user table (maps to existing users with additional fields)
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Better Auth session table
CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

-- Better Auth account table (OAuth providers)
CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TEXT,
  "refreshTokenExpiresAt" TEXT,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Better Auth verification table
CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "createdAt" TEXT,
  "updatedAt" TEXT
);

-- Migrate existing users from NextAuth "users" table to Better Auth "user" table
INSERT OR IGNORE INTO "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt")
SELECT
  "id",
  COALESCE("name", "email"),
  "email",
  CASE WHEN "emailVerified" IS NOT NULL THEN 1 ELSE 0 END,
  "image",
  datetime('now'),
  datetime('now')
FROM "users";

-- Migrate existing OAuth accounts from NextAuth "accounts" table to Better Auth "account" table
INSERT OR IGNORE INTO "account" ("id", "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "scope", "createdAt", "updatedAt")
SELECT
  "id",
  "providerAccountId",
  "provider",
  "userId",
  "access_token",
  "refresh_token",
  "id_token",
  "scope",
  datetime('now'),
  datetime('now')
FROM "accounts";

-- Update foreign keys in application tables to reference new "user" table
-- (The existing app tables reference "users" table. Since we're keeping both,
--  and the IDs are the same, the app tables work with either.)

-- Note: After confirming Better Auth works, you can drop the old NextAuth tables:
-- DROP TABLE IF EXISTS "sessions";
-- DROP TABLE IF EXISTS "accounts";
-- DROP TABLE IF EXISTS "verificationTokens";
-- DROP TABLE IF EXISTS "users";
