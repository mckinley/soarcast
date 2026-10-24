ALTER TABLE `custom_sites` ADD `terrain` text;--> statement-breakpoint
ALTER TABLE `custom_sites` ADD `terrain_slope` real;--> statement-breakpoint
ALTER TABLE `custom_sites` ADD `terrain_relief` integer;--> statement-breakpoint
ALTER TABLE `launch_sites` ADD `terrain_slope` real;--> statement-breakpoint
ALTER TABLE `launch_sites` ADD `terrain_relief` integer;--> statement-breakpoint
ALTER TABLE `user_favorite_sites` ADD `terrain` text;--> statement-breakpoint
-- A private site's wind limit of 0 takes the usual limit for its terrain.
-- The add form filled in 25, the usual limit, so those become 0.
UPDATE `custom_sites` SET `max_wind_speed` = 0 WHERE `max_wind_speed` = 25;
