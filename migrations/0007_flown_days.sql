CREATE TABLE `flown_days` (
	`key` text PRIMARY KEY NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`days` text NOT NULL,
	`fetched_at` integer NOT NULL
);
