CREATE TABLE `ensemble_history` (
	`key` text NOT NULL,
	`date` text NOT NULL,
	`lead_days` integer NOT NULL,
	`runs` integer NOT NULL,
	`go` integer NOT NULL,
	`marginal` integer NOT NULL,
	`no` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`key`, `date`, `lead_days`)
);
--> statement-breakpoint
CREATE TABLE `site_ensembles` (
	`key` text PRIMARY KEY NOT NULL,
	`site_ref` text NOT NULL,
	`time_zone` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`days` text NOT NULL
);
