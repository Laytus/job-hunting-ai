CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_name" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_operation_name_not_blank" CHECK (btrim("ai_usage"."operation_name") <> ''),
	CONSTRAINT "ai_usage_model_not_blank" CHECK (btrim("ai_usage"."model") <> ''),
	CONSTRAINT "ai_usage_input_tokens_non_negative" CHECK ("ai_usage"."input_tokens" >= 0),
	CONSTRAINT "ai_usage_output_tokens_non_negative" CHECK ("ai_usage"."output_tokens" >= 0),
	CONSTRAINT "ai_usage_total_tokens_non_negative" CHECK ("ai_usage"."total_tokens" >= 0)
);
--> statement-breakpoint
CREATE INDEX "ai_usage_operation_name_idx" ON "ai_usage" USING btree ("operation_name");