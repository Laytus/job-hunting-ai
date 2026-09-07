CREATE TYPE "public"."job_analysis_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "job_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"status" "job_analysis_status" NOT NULL,
	"analysis_data" jsonb,
	"suggested_score" integer,
	"failure_code" text,
	"failure_message" text,
	"prompt_version" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_analyses_analysis_data_object" CHECK ("job_analyses"."analysis_data" IS NULL OR jsonb_typeof("job_analyses"."analysis_data") = 'object'),
	CONSTRAINT "job_analyses_suggested_score_range" CHECK ("job_analyses"."suggested_score" IS NULL OR ("job_analyses"."suggested_score" >= 0 AND "job_analyses"."suggested_score" <= 100)),
	CONSTRAINT "job_analyses_prompt_version_not_blank" CHECK (btrim("job_analyses"."prompt_version") <> ''),
	CONSTRAINT "job_analyses_failure_code_not_blank" CHECK ("job_analyses"."failure_code" IS NULL OR btrim("job_analyses"."failure_code") <> ''),
	CONSTRAINT "job_analyses_failure_message_not_blank" CHECK ("job_analyses"."failure_message" IS NULL OR btrim("job_analyses"."failure_message") <> ''),
	CONSTRAINT "job_analyses_terminal_timestamp_order" CHECK (("job_analyses"."completed_at" IS NULL OR "job_analyses"."completed_at" >= "job_analyses"."started_at") AND ("job_analyses"."failed_at" IS NULL OR "job_analyses"."failed_at" >= "job_analyses"."started_at")),
	CONSTRAINT "job_analyses_state_consistency" CHECK ((
        ("job_analyses"."status" = 'RUNNING' AND "job_analyses"."analysis_data" IS NULL AND "job_analyses"."suggested_score" IS NULL AND "job_analyses"."failure_code" IS NULL AND "job_analyses"."failure_message" IS NULL AND "job_analyses"."completed_at" IS NULL AND "job_analyses"."failed_at" IS NULL)
        OR
        ("job_analyses"."status" = 'COMPLETED' AND "job_analyses"."analysis_data" IS NOT NULL AND "job_analyses"."failure_code" IS NULL AND "job_analyses"."failure_message" IS NULL AND "job_analyses"."completed_at" IS NOT NULL AND "job_analyses"."failed_at" IS NULL)
        OR
        ("job_analyses"."status" = 'FAILED' AND "job_analyses"."analysis_data" IS NULL AND "job_analyses"."suggested_score" IS NULL AND "job_analyses"."completed_at" IS NULL AND "job_analyses"."failed_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "job_analyses" ADD CONSTRAINT "job_analyses_application_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_analyses_application_running_uq" ON "job_analyses" USING btree ("application_id") WHERE "job_analyses"."status" = 'RUNNING';--> statement-breakpoint
CREATE INDEX "job_analyses_application_history_idx" ON "job_analyses" USING btree ("application_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_analyses_application_status_history_idx" ON "job_analyses" USING btree ("application_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);