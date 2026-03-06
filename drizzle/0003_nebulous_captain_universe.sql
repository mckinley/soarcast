-- Create new tables
CREATE TABLE `custom_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`latitude` text NOT NULL,
	`longitude` text NOT NULL,
	`elevation` integer NOT NULL,
	`max_wind_speed` integer NOT NULL,
	`ideal_wind_directions` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `launch_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`country_code` text,
	`region` text,
	`latitude` text NOT NULL,
	`longitude` text NOT NULL,
	`elevation` integer,
	`landing_elevation` integer,
	`orientations` text,
	`site_type` text,
	`flying_types` text,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`description` text,
	`landing_lat` text,
	`landing_lng` text,
	`landing_description` text,
	`max_wind_speed` integer,
	`ideal_wind_directions` text,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `launch_sites_slug_unique` ON `launch_sites` (`slug`);
--> statement-breakpoint
CREATE TABLE `user_favorite_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`site_id` text NOT NULL,
	`notes` text,
	`custom_max_wind` integer,
	`custom_ideal_directions` text,
	`notify` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `launch_sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_favorite_sites_user_id_site_id_unique` ON `user_favorite_sites` (`user_id`,`site_id`);
--> statement-breakpoint

-- Migrate existing sites to custom_sites
INSERT INTO `custom_sites` (`id`, `user_id`, `name`, `latitude`, `longitude`, `elevation`, `max_wind_speed`, `ideal_wind_directions`, `created_at`, `updated_at`)
SELECT `id`, `userId`, `name`, `latitude`, `longitude`, `elevation`, `maxWindSpeed`, `idealWindDirections`, `createdAt`, `updatedAt`
FROM `sites`;
--> statement-breakpoint

-- Update forecasts_cache to add site_type and remove FK
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_forecasts_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`siteId` text NOT NULL,
	`site_type` text NOT NULL,
	`fetchDate` text NOT NULL,
	`data` text NOT NULL,
	`fetchedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
-- Migrate existing forecasts with 'legacy' type (sites that may still exist in sites table)
INSERT INTO `__new_forecasts_cache` (`id`, `siteId`, `site_type`, `fetchDate`, `data`, `fetchedAt`, `expiresAt`)
SELECT `id`, `siteId`, 'legacy', `fetchDate`, `data`, `fetchedAt`, `expiresAt`
FROM `forecasts_cache`;
--> statement-breakpoint
DROP TABLE `forecasts_cache`;
--> statement-breakpoint
ALTER TABLE `__new_forecasts_cache` RENAME TO `forecasts_cache`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE UNIQUE INDEX `forecasts_cache_siteId_site_type_fetchDate_unique` ON `forecasts_cache` (`siteId`,`site_type`,`fetchDate`);
