CREATE TYPE "public"."document_type" AS ENUM('MARKDOWN_NOTE', 'COVER_LETTER', 'INTERVIEW_BRIEF');--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"content_markdown" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_versions_content_markdown_not_blank" CHECK (btrim("document_versions"."content_markdown") <> ''),
	CONSTRAINT "document_versions_metadata_object" CHECK ("document_versions"."metadata" IS NULL OR jsonb_typeof("document_versions"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid,
	"application_id" uuid,
	"type" "document_type" NOT NULL,
	"title" text NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_exactly_one_owner" CHECK (num_nonnulls("documents"."candidate_id", "documents"."application_id") = 1),
	CONSTRAINT "documents_title_not_blank" CHECK (btrim("documents"."title") <> '')
);
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_candidate_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_application_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_document_id_id_uq" ON "document_versions" USING btree ("document_id","id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_version_fk" FOREIGN KEY ("id","current_version_id") REFERENCES "public"."document_versions"("document_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "document_versions_document_history_idx" ON "document_versions" USING btree ("document_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_candidate_idx" ON "documents" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "documents_application_idx" ON "documents" USING btree ("application_id");
