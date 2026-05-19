CREATE TABLE `deal_extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`show_id` text NOT NULL,
	`extraction_json` text NOT NULL,
	`confirmed_terms_json` text,
	`confirmation_log_json` text,
	`confirmed_at` integer,
	`confirmed_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deal_extractions_deal_id_unique` ON `deal_extractions` (`deal_id`);--> statement-breakpoint
ALTER TABLE `settlements` ADD `worksheet_json` text;--> statement-breakpoint
ALTER TABLE `settlements` ADD `gm_approved_at` integer;--> statement-breakpoint
ALTER TABLE `settlements` ADD `gm_approved_by_user_id` text REFERENCES users(id);