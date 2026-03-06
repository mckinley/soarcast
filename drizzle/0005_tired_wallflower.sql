CREATE TABLE `atmospheric_profiles_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`location_key` text NOT NULL,
	`fetch_date` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `atmospheric_profiles_cache_location_key_fetch_date_unique` ON `atmospheric_profiles_cache` (`location_key`,`fetch_date`);