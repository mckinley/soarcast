CREATE TABLE `site_seasons` (
	`key` text PRIMARY KEY NOT NULL,
	`site_ref` text NOT NULL,
	`name` text,
	`country_code` text,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`destination` text,
	`days` text NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`built_at` integer NOT NULL
);
