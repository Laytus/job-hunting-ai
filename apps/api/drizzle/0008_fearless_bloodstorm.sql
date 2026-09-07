CREATE TYPE "public"."research_claim_source_relationship" AS ENUM('SUPPORTS', 'CONTRADICTS');--> statement-breakpoint
CREATE TYPE "public"."research_claim_type" AS ENUM('COMPANY_DESCRIPTION', 'BUSINESS_AREA', 'PARIS_PRESENCE', 'ROLE_INFORMATION', 'SALARY_BASE', 'TOTAL_COMPENSATION', 'INTERVIEW_STAGE', 'INTERVIEW_TOPIC', 'TECHNOLOGY', 'CULTURE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."research_confidence" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."research_evidence_type" AS ENUM('FACT', 'REPORTED', 'INFERRED');--> statement-breakpoint
CREATE TYPE "public"."research_source_quality" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."research_source_type" AS ENUM('OFFICIAL', 'NEWS', 'SALARY_DATABASE', 'INTERVIEW_REPORT', 'FORUM', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."research_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "research_claim_sources" (
	"research_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"relationship" "research_claim_source_relationship" NOT NULL,
	"evidence_text" text NOT NULL,
	CONSTRAINT "research_claim_sources_pk" PRIMARY KEY("claim_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "research_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_id" uuid NOT NULL,
	"type" "research_claim_type" NOT NULL,
	"value_text" text,
	"value_json" jsonb,
	"evidence_type" "research_evidence_type" NOT NULL,
	"confidence" "research_confidence" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_claims_value_required" CHECK ("research_claims"."value_text" IS NOT NULL OR "research_claims"."value_json" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "research_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_id" uuid NOT NULL,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"title" text,
	"publisher" text,
	"source_type" "research_source_type" NOT NULL,
	"source_quality" "research_source_quality" NOT NULL,
	"published_at" date,
	"retrieved_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_sources_url_not_blank" CHECK (btrim("research_sources"."url") <> ''),
	CONSTRAINT "research_sources_normalized_url_not_blank" CHECK (btrim("research_sources"."normalized_url") <> '')
);
--> statement-breakpoint
CREATE TABLE "researches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"status" "research_status" NOT NULL,
	"summary_markdown" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_version" text,
	"research_date" timestamp with time zone NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "researches_warnings_array" CHECK (jsonb_typeof("researches"."warnings") = 'array'),
	CONSTRAINT "researches_prompt_version_not_blank" CHECK ("researches"."prompt_version" IS NULL OR btrim("researches"."prompt_version") <> ''),
	CONSTRAINT "researches_failure_code_not_blank" CHECK ("researches"."failure_code" IS NULL OR btrim("researches"."failure_code") <> ''),
	CONSTRAINT "researches_failure_message_not_blank" CHECK ("researches"."failure_message" IS NULL OR btrim("researches"."failure_message") <> ''),
	CONSTRAINT "researches_terminal_timestamp_order" CHECK (("researches"."completed_at" IS NULL OR "researches"."completed_at" >= "researches"."started_at") AND ("researches"."failed_at" IS NULL OR "researches"."failed_at" >= "researches"."started_at")),
	CONSTRAINT "researches_state_consistency" CHECK ((
        ("researches"."status" = 'RUNNING' AND "researches"."summary_markdown" IS NULL AND "researches"."failure_code" IS NULL AND "researches"."failure_message" IS NULL AND "researches"."completed_at" IS NULL AND "researches"."failed_at" IS NULL)
        OR
        ("researches"."status" = 'COMPLETED' AND "researches"."failure_code" IS NULL AND "researches"."failure_message" IS NULL AND "researches"."completed_at" IS NOT NULL AND "researches"."failed_at" IS NULL)
        OR
        ("researches"."status" = 'FAILED' AND "researches"."summary_markdown" IS NULL AND "researches"."completed_at" IS NULL AND "researches"."failed_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "research_claims_research_id_id_uq" ON "research_claims" USING btree ("research_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_sources_research_id_id_uq" ON "research_sources" USING btree ("research_id","id");--> statement-breakpoint
ALTER TABLE "research_claim_sources" ADD CONSTRAINT "research_claim_sources_claim_ownership_fk" FOREIGN KEY ("research_id","claim_id") REFERENCES "public"."research_claims"("research_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_claim_sources" ADD CONSTRAINT "research_claim_sources_source_ownership_fk" FOREIGN KEY ("research_id","source_id") REFERENCES "public"."research_sources"("research_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_claims" ADD CONSTRAINT "research_claims_research_fk" FOREIGN KEY ("research_id") REFERENCES "public"."researches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_research_fk" FOREIGN KEY ("research_id") REFERENCES "public"."researches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "researches" ADD CONSTRAINT "researches_application_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_claim_sources_research_idx" ON "research_claim_sources" USING btree ("research_id");--> statement-breakpoint
CREATE INDEX "research_claim_sources_source_idx" ON "research_claim_sources" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_sources_research_normalized_url_uq" ON "research_sources" USING btree ("research_id","normalized_url");--> statement-breakpoint
CREATE UNIQUE INDEX "researches_application_running_uq" ON "researches" USING btree ("application_id") WHERE "researches"."status" = 'RUNNING';--> statement-breakpoint
CREATE INDEX "researches_application_history_idx" ON "researches" USING btree ("application_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "researches_application_status_history_idx" ON "researches" USING btree ("application_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
