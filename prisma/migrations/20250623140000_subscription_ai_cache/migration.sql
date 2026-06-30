-- Subscription tiers, AI activity cache, AI usage logs

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "plan_tier" TEXT NOT NULL DEFAULT 'STANDARD';

CREATE TABLE IF NOT EXISTS "subscription_plan_limits" (
  "id" SERIAL PRIMARY KEY,
  "tier" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL DEFAULT 'Standard',
  "max_cleaners" INTEGER NOT NULL DEFAULT 25,
  "max_properties" INTEGER NOT NULL DEFAULT 50,
  "max_managers" INTEGER NOT NULL DEFAULT 10,
  "ai_requests_per_month" INTEGER NOT NULL DEFAULT 500,
  "ai_photo_analysis" BOOLEAN NOT NULL DEFAULT true,
  "ai_insights" BOOLEAN NOT NULL DEFAULT true,
  "ai_assignment" BOOLEAN NOT NULL DEFAULT true,
  "ai_task_suggestions" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "subscription_plan_limits" ("tier", "label", "max_cleaners", "max_properties", "max_managers", "ai_requests_per_month", "ai_photo_analysis", "ai_insights", "ai_assignment", "ai_task_suggestions")
VALUES
  ('STARTUP', 'Startup', 5, 10, 2, 50, true, false, true, true),
  ('STANDARD', 'Standard', 25, 50, 10, 500, true, true, true, true),
  ('PREMIUM', 'Premium', 999, 999, 999, 99999, true, true, true, true)
ON CONFLICT ("tier") DO NOTHING;

CREATE TABLE IF NOT EXISTS "ai_activity_cache" (
  "id" SERIAL PRIMARY KEY,
  "company_id" INTEGER NOT NULL,
  "feature" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "activity_fingerprint" TEXT NOT NULL,
  "cached_result" TEXT,
  "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_activity_cache_unique" UNIQUE ("company_id", "feature", "scope_key")
);

CREATE INDEX IF NOT EXISTS "ai_activity_cache_company_id_idx" ON "ai_activity_cache"("company_id");

CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
  "id" SERIAL PRIMARY KEY,
  "company_id" INTEGER NOT NULL,
  "feature" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ai_usage_logs_company_id_created_at_idx" ON "ai_usage_logs"("company_id", "created_at");
