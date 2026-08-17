-- Photo verification & task PDF generation monthly quotas per plan tier
ALTER TABLE "subscription_plan_limits"
  ADD COLUMN IF NOT EXISTS "max_photo_verifications_per_month" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "max_pdf_generations_per_month" INTEGER NOT NULL DEFAULT 50;

UPDATE "subscription_plan_limits" SET "max_photo_verifications_per_month" = 30, "max_pdf_generations_per_month" = 20 WHERE "tier" = 'STARTUP';
UPDATE "subscription_plan_limits" SET "max_photo_verifications_per_month" = 200, "max_pdf_generations_per_month" = 100 WHERE "tier" = 'STANDARD';
UPDATE "subscription_plan_limits" SET "max_photo_verifications_per_month" = 99999, "max_pdf_generations_per_month" = 99999 WHERE "tier" = 'PREMIUM';
