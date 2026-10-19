CREATE TABLE `atmospheric_profiles_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`location_key` text NOT NULL,
	`fetch_date` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `atmospheric_profiles_cache_location_key_fetch_date_unique` ON `atmospheric_profiles_cache` (`location_key`,`fetch_date`);--> statement-breakpoint
CREATE TABLE `custom_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`latitude` text NOT NULL,
	`longitude` text NOT NULL,
	`elevation` integer NOT NULL,
	`max_wind_speed` integer NOT NULL,
	`ideal_wind_directions` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `forecasts_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`site_type` text NOT NULL,
	`fetch_date` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forecasts_cache_site_id_site_type_fetch_date_unique` ON `forecasts_cache` (`site_id`,`site_type`,`fetch_date`);--> statement-breakpoint
CREATE TABLE `launch_sites` (
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
	`is_paragliding` integer DEFAULT false NOT NULL,
	`is_hanggliding` integer DEFAULT false NOT NULL,
	`site_type` text,
	`source` text NOT NULL,
	`pgsites_id` text NOT NULL,
	`description` text,
	`landing_description` text,
	`max_wind_speed` integer,
	`pge_link` text,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `launch_sites_slug_unique` ON `launch_sites` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `launch_sites_pgsites_id_unique` ON `launch_sites` (`pgsites_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`keys` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`min_score_threshold` integer DEFAULT 70 NOT NULL,
	`days_ahead` integer DEFAULT 2 NOT NULL,
	`site_notifications` text DEFAULT '{}' NOT NULL,
	`morning_digest_enabled` integer DEFAULT false NOT NULL,
	`morning_digest_time` text DEFAULT '08:00',
	`onboarding_completed` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_user_id_unique` ON `settings` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_favorite_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`site_id` text NOT NULL,
	`notes` text,
	`custom_max_wind` integer,
	`custom_ideal_directions` text,
	`notify` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `launch_sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_favorite_sites_user_id_site_id_unique` ON `user_favorite_sites` (`user_id`,`site_id`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);