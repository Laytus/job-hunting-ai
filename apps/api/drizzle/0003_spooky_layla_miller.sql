CREATE TYPE "public"."interview_status" AS ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED');--> statement-breakpoint
CREATE TYPE "public"."interview_type" AS ENUM('RECRUITER', 'HR', 'TECHNICAL', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'FINAL', 'OTHER');--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"type" "interview_type" NOT NULL,
	"status" "interview_status" NOT NULL,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes_markdown" text,
	"feedback_markdown" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interviews_timestamp_order" CHECK ("interviews"."completed_at" IS NULL OR "interviews"."scheduled_at" IS NULL OR "interviews"."completed_at" >= "interviews"."scheduled_at"),
	CONSTRAINT "interviews_sort_order_non_negative" CHECK ("interviews"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interviews_application_order_idx" ON "interviews" USING btree ("application_id","sort_order","scheduled_at","created_at","id");