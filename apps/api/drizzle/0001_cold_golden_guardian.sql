CREATE TYPE "public"."application_priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."application_source" AS ENUM('CAREER_PAGE', 'LINKEDIN', 'REFERRAL', 'RECRUITER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('FOUND', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"role_title" text NOT NULL,
	"location" text,
	"job_url" text,
	"source" "application_source" NOT NULL,
	"status" "application_status" NOT NULL,
	"priority" "application_priority" NOT NULL,
	"date_found" date,
	"date_applied" date,
	"notes_markdown" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_company_name_not_blank" CHECK (btrim("applications"."company_name") <> ''),
	CONSTRAINT "applications_role_title_not_blank" CHECK (btrim("applications"."role_title") <> ''),
	CONSTRAINT "applications_date_range" CHECK ("applications"."date_applied" IS NULL OR "applications"."date_found" IS NULL OR "applications"."date_applied" >= "applications"."date_found")
);
