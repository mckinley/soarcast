CREATE TABLE `site_areas` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`alerts` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `custom_sites` ADD `area_id` text REFERENCES site_areas(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `user_favorite_sites` ADD `area_id` text REFERENCES site_areas(id) ON DELETE set null;