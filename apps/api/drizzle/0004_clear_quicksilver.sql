CREATE TYPE "public"."application_event_type" AS ENUM('APPLICATION_CREATED', 'APPLICATION_UPDATED', 'APPLICATION_STATUS_CHANGED', 'JOB_DESCRIPTION_CREATED', 'JOB_DESCRIPTION_UPDATED', 'INTERVIEW_CREATED', 'INTERVIEW_UPDATED');--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"type" "application_event_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_events_title_not_blank" CHECK (btrim("application_events"."title") <> ''),
	CONSTRAINT "application_events_description_not_blank" CHECK (btrim("application_events"."description") <> ''),
	CONSTRAINT "application_events_metadata_object" CHECK ("application_events"."metadata" IS NULL OR jsonb_typeof("application_events"."metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_events_application_order_idx" ON "application_events" USING btree ("application_id","occurred_at" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);