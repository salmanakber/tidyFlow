-- Plan scope for Google Sheets & QuickBooks + payroll QB sync fields

ALTER TABLE "subscription_plan_limits" ADD COLUMN IF NOT EXISTS "google_sheets_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subscription_plan_limits" ADD COLUMN IF NOT EXISTS "quickbooks_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "payroll_records" ADD COLUMN IF NOT EXISTS "quickbooks_bill_id" TEXT;
ALTER TABLE "payroll_records" ADD COLUMN IF NOT EXISTS "quickbooks_doc_number" TEXT;
ALTER TABLE "payroll_records" ADD COLUMN IF NOT EXISTS "quickbooks_sync_status" TEXT;
ALTER TABLE "payroll_records" ADD COLUMN IF NOT EXISTS "quickbooks_synced_at" TIMESTAMP(3);
ALTER TABLE "payroll_records" ADD COLUMN IF NOT EXISTS "quickbooks_sync_error" TEXT;

ALTER TABLE "quickbooks_connections" ADD COLUMN IF NOT EXISTS "auto_sync_on_payroll" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "quickbooks_connections" ADD COLUMN IF NOT EXISTS "payroll_synced" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "quickbooks_sync_logs" ADD COLUMN IF NOT EXISTS "payroll_record_id" INTEGER;

CREATE TABLE IF NOT EXISTS "quickbooks_vendor_maps" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "quickbooks_vendor_id" TEXT NOT NULL,

    CONSTRAINT "quickbooks_vendor_maps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quickbooks_vendor_maps_company_id_user_id_key"
ON "quickbooks_vendor_maps"("company_id", "user_id");

CREATE INDEX IF NOT EXISTS "quickbooks_vendor_maps_company_id_idx"
ON "quickbooks_vendor_maps"("company_id");

DO $$ BEGIN
  ALTER TABLE "quickbooks_vendor_maps" ADD CONSTRAINT "quickbooks_vendor_maps_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "subscription_plan_limits"
SET "google_sheets_enabled" = true, "quickbooks_enabled" = false
WHERE "tier" = 'STANDARD';

UPDATE "subscription_plan_limits"
SET "google_sheets_enabled" = true, "quickbooks_enabled" = true
WHERE "tier" = 'PREMIUM';
