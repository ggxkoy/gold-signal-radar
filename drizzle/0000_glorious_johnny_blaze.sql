CREATE TABLE `prediction_rules` (
	`prediction_id` integer NOT NULL,
	`rule_label` text NOT NULL,
	`rule_direction` text NOT NULL,
	`base_weight` real NOT NULL,
	PRIMARY KEY(`prediction_id`, `rule_label`),
	FOREIGN KEY (`prediction_id`) REFERENCES `predictions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_prediction_rules_label` ON `prediction_rules` (`rule_label`);--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fingerprint` text NOT NULL,
	`headline` text NOT NULL,
	`source` text NOT NULL,
	`url` text NOT NULL,
	`predicted_at` integer NOT NULL,
	`horizon_hours` integer DEFAULT 24 NOT NULL,
	`predicted_direction` text NOT NULL,
	`raw_score` real NOT NULL,
	`signal_strength` integer NOT NULL,
	`entry_cny_gram` real NOT NULL,
	`due_at` integer NOT NULL,
	`settled_at` integer,
	`exit_cny_gram` real,
	`actual_direction` text,
	`correct` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_predictions_fingerprint` ON `predictions` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_predictions_due_unsettled` ON `predictions` (`due_at`,`settled_at`);--> statement-breakpoint
CREATE INDEX `idx_predictions_predicted_at` ON `predictions` (`predicted_at`);--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`captured_at` integer NOT NULL,
	`usd_oz` real NOT NULL,
	`usd_cny` real NOT NULL,
	`cny_gram` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_price_snapshots_captured_at` ON `price_snapshots` (`captured_at`);--> statement-breakpoint
PRAGMA optimize;
