CREATE TABLE `request_timings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer DEFAULT (unixepoch()) NOT NULL,
	`page` text NOT NULL,
	`status` integer NOT NULL,
	`signed_in` integer NOT NULL,
	`cold` integer NOT NULL,
	`total_ms` integer NOT NULL,
	`d1_count` integer NOT NULL,
	`d1_ms` integer NOT NULL,
	`calls` text NOT NULL,
	`colo` text
);
