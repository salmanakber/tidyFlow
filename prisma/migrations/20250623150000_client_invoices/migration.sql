-- Property client fields, client invoices, plan invoice limits

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "client_name" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "client_email" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "client_phone" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "default_service_rate" DECIMAL(10,2);

ALTER TABLE "subscription_plan_limits" ADD COLUMN IF NOT EXISTS "invoices_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "subscription_plan_limits" ADD COLUMN IF NOT EXISTS "max_invoices_per_month" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "subscription_plan_limits" ADD COLUMN IF NOT EXISTS "ai_invoice_assist" BOOLEAN NOT NULL DEFAULT false;

UPDATE "subscription_plan_limits" SET "invoices_enabled" = false, "max_invoices_per_month" = 5, "ai_invoice_assist" = false WHERE "tier" = 'STARTUP';
UPDATE "subscription_plan_limits" SET "invoices_enabled" = true, "max_invoices_per_month" = 50, "ai_invoice_assist" = true WHERE "tier" = 'STANDARD';
UPDATE "subscription_plan_limits" SET "invoices_enabled" = true, "max_invoices_per_month" = 99999, "ai_invoice_assist" = true WHERE "tier" = 'PREMIUM';

CREATE TABLE IF NOT EXISTS "client_invoices" (
  "id" SERIAL PRIMARY KEY,
  "company_id" INTEGER NOT NULL,
  "task_id" INTEGER,
  "property_id" INTEGER,
  "invoice_number" TEXT NOT NULL UNIQUE,
  "client_name" TEXT NOT NULL,
  "client_email" TEXT,
  "client_phone" TEXT,
  "client_address" TEXT,
  "line_items" TEXT NOT NULL,
  "subtotal" DECIMAL(10,2) NOT NULL,
  "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total_amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "notes" TEXT,
  "pdf_url" TEXT,
  "sent_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "due_date" TIMESTAMP(3),
  "ai_generated" BOOLEAN NOT NULL DEFAULT false,
  "created_by_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "client_invoices_company_id_idx" ON "client_invoices"("company_id");
CREATE INDEX IF NOT EXISTS "client_invoices_task_id_idx" ON "client_invoices"("task_id");
CREATE INDEX IF NOT EXISTS "client_invoices_status_idx" ON "client_invoices"("status");
