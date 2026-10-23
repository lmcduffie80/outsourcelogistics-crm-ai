CREATE TABLE "sign_in_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"allowed" boolean NOT NULL,
	"reason" text,
	"method" text NOT NULL,
	"ip_address" text,
	"city" text,
	"region" text,
	"country" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sign_in_events" ADD CONSTRAINT "sign_in_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sign_in_events_created_idx" ON "sign_in_events" USING btree ("created_at");