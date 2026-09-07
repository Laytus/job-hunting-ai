CREATE TABLE "job_descriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"title" text,
	"company_name" text,
	"description_markdown" text NOT NULL,
	"requirements_markdown" text,
	"responsibilities_markdown" text,
	"structured_data" jsonb,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_descriptions_description_markdown_not_blank" CHECK (btrim("job_descriptions"."description_markdown") <> '')
);
--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_application_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_descriptions_application_uq" ON "job_descriptions" USING btree ("application_id");