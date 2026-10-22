CREATE TABLE `noga_takeoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country_code` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`site_id` text NOT NULL,
	`site_name` text NOT NULL,
	`region_id` text NOT NULL,
	`region_name` text NOT NULL,
	`flights` integer NOT NULL,
	`years` integer NOT NULL,
	`by_month` text NOT NULL,
	`avg_points` real,
	`max_points` real,
	`fetched_at` integer NOT NULL
);
