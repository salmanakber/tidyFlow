-- TidyFlow AI & Safety Features Migration
-- Run: npx prisma migrate dev --name tidyflow_ai_features

-- User preferences: language support
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en';

-- Location logs: check type
ALTER TABLE "location_logs" ADD COLUMN IF NOT EXISTS "check_type" TEXT NOT NULL DEFAULT 'check';

-- SOS Alerts
CREATE TABLE IF NOT EXISTS "sos_alerts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "task_id" INTEGER,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "acknowledged_by" INTEGER,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sos_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sos_alerts_company_id_idx" ON "sos_alerts"("company_id");
CREATE INDEX IF NOT EXISTS "sos_alerts_user_id_idx" ON "sos_alerts"("user_id");
CREATE INDEX IF NOT EXISTS "sos_alerts_status_idx" ON "sos_alerts"("status");

-- AI Photo Scores
CREATE TABLE IF NOT EXISTS "ai_photo_scores" (
    "id" SERIAL NOT NULL,
    "photo_id" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "flags" TEXT,
    "summary" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'groq',
    "model" TEXT,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_photo_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_photo_scores_photo_id_key" ON "ai_photo_scores"("photo_id");

-- Cleaner AI Profiles
CREATE TABLE IF NOT EXISTS "cleaner_ai_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "punctuality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reliability_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "client_satisfaction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_completion_mins" DOUBLE PRECISION,
    "tasks_completed" INTEGER NOT NULL DEFAULT 0,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "preferred_task_types" TEXT,
    "ai_summary" TEXT,
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cleaner_ai_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cleaner_ai_profiles_user_id_key" ON "cleaner_ai_profiles"("user_id");

-- AI Insights
CREATE TABLE IF NOT EXISTS "ai_insights" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" INTEGER,
    "metadata" TEXT,
    "dismissed_at" TIMESTAMP(3),
    "dismissed_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- AI Configuration
CREATE TABLE IF NOT EXISTS "ai_configurations" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "provider" TEXT NOT NULL DEFAULT 'groq',
    "model" TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
    "vision_model" TEXT NOT NULL DEFAULT 'llama-3.2-90b-vision-preview',
    "photo_verification" BOOLEAN NOT NULL DEFAULT true,
    "assignment_recommend" BOOLEAN NOT NULL DEFAULT true,
    "insights_enabled" BOOLEAN NOT NULL DEFAULT true,
    "min_photo_score" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_configurations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_configurations_company_id_key" ON "ai_configurations"("company_id");

-- Supply Items
CREATE TABLE IF NOT EXISTS "supply_items" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'units',
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supply_items_pkey" PRIMARY KEY ("id")
);

-- Supply Usage
CREATE TABLE IF NOT EXISTS "supply_usages" (
    "id" SERIAL NOT NULL,
    "supply_item_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "task_id" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supply_usages_pkey" PRIMARY KEY ("id")
);

-- Review Requests
CREATE TABLE IF NOT EXISTS "review_requests" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "redirect_url" TEXT,
    "submitted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "review_requests_token_key" ON "review_requests"("token");
