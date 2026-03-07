# Scripts Directory

This directory contains utility scripts for database migrations and maintenance tasks.

## Duplicate Sites Migration

**File:** `migrate-duplicate-sites.ts`

**Purpose:** Detect and migrate duplicate custom_sites that match existing launch_sites.

**What it does:**

1. Finds custom_sites within 5km of a launch_site with similar name
2. Converts matched custom_sites into user_favorite_sites entries
3. Preserves custom preferences (maxWindSpeed, idealDirections)
4. Deletes the orphaned custom_site after migration

**Usage:**

```bash
npx tsx scripts/migrate-duplicate-sites.ts
```

**Important notes:**

- Uses a 5km radius threshold (generous for mountain sites with multiple launch points)
- Name similarity matching uses fuzzy logic (removes common words like "launch", "mountain")
- Always preserves user data by creating favorites before deleting custom sites
- Safe to run multiple times (idempotent)
- Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables

**When to run:**

- After importing new launch_sites data
- When users report duplicate sites with incorrect data
- During database cleanup/maintenance

## Site Utilities

The migration script uses shared utilities from `src/lib/site-utils.ts`:

- `calculateDistance()`: Haversine formula for lat/lng distance
- `namesAreSimilar()`: Fuzzy name matching for site names
- `findNearbySites()`: Find launch sites near a location (for future custom site creation UI)
