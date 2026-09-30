CREATE TABLE "booking" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_key" text NOT NULL,
	"slot" smallint NOT NULL,
	"pseudo" text NOT NULL,
	"game_id" text NOT NULL,
	"alliance" text NOT NULL,
	"accelerators" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"edit_token_hash" text NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "booking_slot_range" CHECK ("booking"."slot" BETWEEN 0 AND 47),
	CONSTRAINT "booking_status_values" CHECK ("booking"."status" IN ('pending','confirmed','rejected','withdrawn')),
	CONSTRAINT "booking_position_values" CHECK ("booking"."position_key" IN ('vp_construction','vp_research','ministry_education'))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"monday_utc" date NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "booking_one_confirmed_per_slot" ON "booking" USING btree ("position_key","slot") WHERE "booking"."status" = 'confirmed';--> statement-breakpoint
CREATE UNIQUE INDEX "booking_one_active_per_player" ON "booking" USING btree ("position_key","game_id") WHERE "booking"."status" IN ('pending','confirmed');--> statement-breakpoint
CREATE INDEX "booking_slot_idx" ON "booking" USING btree ("position_key","slot");--> statement-breakpoint
CREATE INDEX "booking_ip_created_idx" ON "booking" USING btree ("ip_hash","created_at");