CREATE TYPE "public"."http_method" AS ENUM('GET', 'HEAD');--> statement-breakpoint
CREATE TYPE "public"."monitor_status" AS ENUM('unknown', 'up', 'down');--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"method" "http_method" DEFAULT 'GET' NOT NULL,
	"interval_sec" integer DEFAULT 60 NOT NULL,
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"expected_status" integer DEFAULT 200 NOT NULL,
	"keyword" text,
	"is_paused" boolean DEFAULT false NOT NULL,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status" "monitor_status" DEFAULT 'unknown' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"consecutive_successes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitors_user_created_idx" ON "monitors" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "monitors_due_idx" ON "monitors" USING btree ("next_check_at") WHERE "monitors"."is_paused" = false;