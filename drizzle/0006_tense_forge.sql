ALTER TABLE `settings` ADD `morningDigestEnabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `morningDigestTime` text DEFAULT '08:00';