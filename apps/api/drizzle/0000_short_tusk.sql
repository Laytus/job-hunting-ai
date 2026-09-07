CREATE TYPE "public"."candidate_skill_category" AS ENUM('PROGRAMMING_LANGUAGE', 'FRAMEWORK', 'LIBRARY', 'DATABASE', 'CLOUD', 'DEVOPS', 'TOOL', 'METHODOLOGY', 'DOMAIN', 'SOFT_SKILL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."candidate_skill_level" AS ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');--> statement-breakpoint
CREATE TABLE "candidate_education" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_profile_id" uuid NOT NULL,
	"institution" text NOT NULL,
	"degree" text NOT NULL,
	"field_of_study" text,
	"location" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"description_markdown" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_education_institution_not_blank" CHECK (btrim("candidate_education"."institution") <> ''),
	CONSTRAINT "candidate_education_degree_not_blank" CHECK (btrim("candidate_education"."degree") <> ''),
	CONSTRAINT "candidate_education_date_range" CHECK ("candidate_education"."end_date" IS NULL OR "candidate_education"."end_date" >= "candidate_education"."start_date"),
	CONSTRAINT "candidate_education_sort_order_non_negative" CHECK ("candidate_education"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "candidate_experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_profile_id" uuid NOT NULL,
	"organization" text NOT NULL,
	"role" text NOT NULL,
	"location" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"description_markdown" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_experiences_organization_not_blank" CHECK (btrim("candidate_experiences"."organization") <> ''),
	CONSTRAINT "candidate_experiences_role_not_blank" CHECK (btrim("candidate_experiences"."role") <> ''),
	CONSTRAINT "candidate_experiences_date_range" CHECK ("candidate_experiences"."end_date" IS NULL OR "candidate_experiences"."end_date" >= "candidate_experiences"."start_date"),
	CONSTRAINT "candidate_experiences_sort_order_non_negative" CHECK ("candidate_experiences"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "candidate_languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_profile_id" uuid NOT NULL,
	"language" text NOT NULL,
	"level" text NOT NULL,
	"certification" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_languages_language_not_blank" CHECK (btrim("candidate_languages"."language") <> ''),
	CONSTRAINT "candidate_languages_level_not_blank" CHECK (btrim("candidate_languages"."level") <> ''),
	CONSTRAINT "candidate_languages_sort_order_non_negative" CHECK ("candidate_languages"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "candidate_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"headline" text,
	"summary_markdown" text,
	"linkedin_url" text,
	"github_url" text,
	"portfolio_url" text,
	"location" text,
	"target_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"career_goals_markdown" text,
	"cv_markdown" text,
	"additional_context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_profiles_full_name_not_blank" CHECK (btrim("candidate_profiles"."full_name") <> ''),
	CONSTRAINT "candidate_profiles_target_roles_array" CHECK (jsonb_typeof("candidate_profiles"."target_roles") = 'array'),
	CONSTRAINT "candidate_profiles_target_locations_array" CHECK (jsonb_typeof("candidate_profiles"."target_locations") = 'array')
);
--> statement-breakpoint
CREATE TABLE "candidate_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"description_markdown" text,
	"project_url" text,
	"repository_url" text,
	"start_date" date,
	"end_date" date,
	"technologies_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_projects_name_not_blank" CHECK (btrim("candidate_projects"."name") <> ''),
	CONSTRAINT "candidate_projects_date_range" CHECK ("candidate_projects"."start_date" IS NULL OR "candidate_projects"."end_date" IS NULL OR "candidate_projects"."end_date" >= "candidate_projects"."start_date"),
	CONSTRAINT "candidate_projects_technologies_array" CHECK (jsonb_typeof("candidate_projects"."technologies_json") = 'array'),
	CONSTRAINT "candidate_projects_sort_order_non_negative" CHECK ("candidate_projects"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "candidate_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "candidate_skill_category" NOT NULL,
	"level" "candidate_skill_level",
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_skills_name_not_blank" CHECK (btrim("candidate_skills"."name") <> ''),
	CONSTRAINT "candidate_skills_sort_order_non_negative" CHECK ("candidate_skills"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_profile_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_experiences" ADD CONSTRAINT "candidate_experiences_profile_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_languages" ADD CONSTRAINT "candidate_languages_profile_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_projects" ADD CONSTRAINT "candidate_projects_profile_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_profile_fk" FOREIGN KEY ("candidate_profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_education_profile_order_idx" ON "candidate_education" USING btree ("candidate_profile_id","sort_order","start_date" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "candidate_experiences_profile_order_idx" ON "candidate_experiences" USING btree ("candidate_profile_id","sort_order","start_date" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_languages_profile_language_uq" ON "candidate_languages" USING btree ("candidate_profile_id",lower(btrim("language")));--> statement-breakpoint
CREATE INDEX "candidate_languages_profile_order_idx" ON "candidate_languages" USING btree ("candidate_profile_id","sort_order","language","id");--> statement-breakpoint
CREATE INDEX "candidate_projects_profile_order_idx" ON "candidate_projects" USING btree ("candidate_profile_id","sort_order","start_date" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_skills_profile_name_uq" ON "candidate_skills" USING btree ("candidate_profile_id",lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "candidate_skills_profile_order_idx" ON "candidate_skills" USING btree ("candidate_profile_id","sort_order","category","id");