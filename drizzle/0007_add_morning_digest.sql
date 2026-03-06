-- Add morning digest preferences to settings table
ALTER TABLE `settings` ADD COLUMN IF NOT EXISTS `morningDigestEnabled` integer DEFAULT 0 NOT NULL;
ALTER TABLE `settings` ADD COLUMN IF NOT EXISTS `morningDigestTime` text DEFAULT '08:00';
