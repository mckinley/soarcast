-- Migration: Standardize launch_sites columns to match pgsites API
-- Strategy: CREATE new table, INSERT...SELECT with transformations, DROP old, RENAME new

-- Step 1: Create launch_sites_new with pgsites-consistent schema
CREATE TABLE IF NOT EXISTS `launch_sites_new` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `country_code` text,
  `region` text,
  `latitude` real NOT NULL,
  `longitude` real NOT NULL,
  `altitude` integer,
  `landing_altitude` integer,
  `landing_latitude` real,
  `landing_longitude` real,
  `wind_n` integer DEFAULT 0 NOT NULL,
  `wind_ne` integer DEFAULT 0 NOT NULL,
  `wind_e` integer DEFAULT 0 NOT NULL,
  `wind_se` integer DEFAULT 0 NOT NULL,
  `wind_s` integer DEFAULT 0 NOT NULL,
  `wind_sw` integer DEFAULT 0 NOT NULL,
  `wind_w` integer DEFAULT 0 NOT NULL,
  `wind_nw` integer DEFAULT 0 NOT NULL,
  `is_paragliding` integer DEFAULT 0 NOT NULL,
  `is_hanggliding` integer DEFAULT 0 NOT NULL,
  `site_type` text,
  `source` text NOT NULL,
  `pgsites_id` text NOT NULL,
  `description` text,
  `landing_description` text,
  `max_wind_speed` integer,
  `pge_link` text,
  `last_synced_at` integer,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);

-- Step 2: Migrate data from old table to new
INSERT INTO `launch_sites_new` (
  `id`, `name`, `slug`, `country_code`, `region`,
  `latitude`, `longitude`, `altitude`,
  `landing_altitude`, `landing_latitude`, `landing_longitude`,
  `wind_n`, `wind_ne`, `wind_e`, `wind_se`,
  `wind_s`, `wind_sw`, `wind_w`, `wind_nw`,
  `is_paragliding`, `is_hanggliding`,
  `site_type`, `source`, `pgsites_id`, `description`,
  `landing_description`, `max_wind_speed`,
  `last_synced_at`, `created_at`, `updated_at`
)
SELECT
  `id`, `name`, `slug`, `country_code`, `region`,
  CAST(`latitude` AS REAL),
  CAST(`longitude` AS REAL),
  `elevation`,
  `landing_elevation`,
  CAST(`landing_lat` AS REAL),
  CAST(`landing_lng` AS REAL),
  -- Parse orientations JSON to individual wind columns
  COALESCE(json_extract(`orientations`, '$.N'), 0),
  COALESCE(json_extract(`orientations`, '$.NE'), 0),
  COALESCE(json_extract(`orientations`, '$.E'), 0),
  COALESCE(json_extract(`orientations`, '$.SE'), 0),
  COALESCE(json_extract(`orientations`, '$.S'), 0),
  COALESCE(json_extract(`orientations`, '$.SW'), 0),
  COALESCE(json_extract(`orientations`, '$.W'), 0),
  COALESCE(json_extract(`orientations`, '$.NW'), 0),
  -- Parse flying_types JSON to boolean flags
  CASE WHEN `flying_types` IS NOT NULL AND json_type(`flying_types`) = 'array'
       AND EXISTS (SELECT 1 FROM json_each(`flying_types`) WHERE value = 'paragliding')
       THEN 1 ELSE 0 END,
  CASE WHEN `flying_types` IS NOT NULL AND json_type(`flying_types`) = 'array'
       AND EXISTS (SELECT 1 FROM json_each(`flying_types`) WHERE value = 'hanggliding')
       THEN 1 ELSE 0 END,
  `site_type`,
  CASE WHEN `source` = 'paraglidingearth' THEN 'pgsites' ELSE `source` END,
  `source_id`,
  `description`,
  `landing_description`,
  `max_wind_speed`,
  -- Convert timestamps from milliseconds to seconds
  CASE WHEN `last_synced_at` IS NOT NULL THEN `last_synced_at` / 1000 ELSE NULL END,
  `created_at` / 1000,
  `updated_at` / 1000
FROM `launch_sites`;

-- Step 3: Drop old table and rename new
DROP TABLE `launch_sites`;
ALTER TABLE `launch_sites_new` RENAME TO `launch_sites`;

-- Step 4: Recreate unique constraint on slug
CREATE UNIQUE INDEX `launch_sites_slug_unique` ON `launch_sites` (`slug`);

-- Step 5: Recreate unique constraint on pgsites_id
CREATE UNIQUE INDEX `launch_sites_pgsites_id_unique` ON `launch_sites` (`pgsites_id`);

-- Step 6: Convert user_favorite_sites timestamps from ms to seconds
UPDATE `user_favorite_sites` SET `created_at` = `created_at` / 1000
WHERE `created_at` > 9999999999;

-- Step 7: Convert custom_sites timestamps from ms to seconds
UPDATE `custom_sites`
SET `created_at` = `created_at` / 1000,
    `updated_at` = `updated_at` / 1000
WHERE `created_at` > 9999999999;
