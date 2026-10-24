ALTER TABLE `settings` ADD `mountain_margins` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- On for every pilot signed up so far, who asked for these margins. New pilots start with them off.
INSERT INTO `settings` (`id`, `user_id`, `mountain_margins`)
SELECT lower(hex(randomblob(16))), `id`, 1 FROM `user` WHERE `id` NOT IN (SELECT `user_id` FROM `settings`);--> statement-breakpoint
UPDATE `settings` SET `mountain_margins` = 1;
