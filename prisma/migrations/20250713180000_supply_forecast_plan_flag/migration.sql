-- Per-plan toggle for smart supply forecasting (admin configurable)

ALTER TABLE "subscription_plan_limits" ADD COLUMN IF NOT EXISTS "ai_supply_forecast" BOOLEAN NOT NULL DEFAULT false;

UPDATE "subscription_plan_limits"
SET "ai_supply_forecast" = true
WHERE "tier" = 'PREMIUM';
