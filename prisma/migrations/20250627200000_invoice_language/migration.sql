ALTER TABLE "company_invoice_settings" ADD COLUMN IF NOT EXISTS "invoice_language" TEXT NOT NULL DEFAULT 'en';
