CREATE TABLE `forecast_track_records` (
	`station_id` text PRIMARY KEY NOT NULL,
	`record` text NOT NULL,
	`computed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `track_record_locations` (
	`location_key` text PRIMARY KEY NOT NULL,
	`station_id` text,
	`distance_km` real,
	`checked_at` integer NOT NULL
);
