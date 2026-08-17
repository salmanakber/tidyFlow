-- AlterTable
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "pending_plan_tier" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "pending_plan_effective_at" TIMESTAMP(3);
