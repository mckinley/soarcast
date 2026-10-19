ALTER TABLE `custom_sites` ADD `site_kind` text;--> statement-breakpoint
ALTER TABLE `custom_sites` ADD `goal` text;--> statement-breakpoint
ALTER TABLE `launch_sites` ADD `is_thermal` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `launch_sites` ADD `is_soaring` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `launch_sites` ADD `is_xc` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `launch_sites` ADD `is_hike` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_favorite_sites` ADD `site_kind` text;--> statement-breakpoint
ALTER TABLE `user_favorite_sites` ADD `goal` text;