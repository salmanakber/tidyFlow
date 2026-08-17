-- Flat monthly price per subscription tier
ALTER TABLE "subscription_plan_limits" ADD COLUMN IF NOT EXISTS "monthly_price" DECIMAL(10,2) DEFAULT 55.00;

UPDATE "subscription_plan_limits" SET "monthly_price" = 29.00 WHERE "tier" = 'STARTUP' AND ("monthly_price" IS NULL OR "monthly_price" = 55.00);
UPDATE "subscription_plan_limits" SET "monthly_price" = 79.00 WHERE "tier" = 'STANDARD' AND ("monthly_price" IS NULL OR "monthly_price" = 55.00);
UPDATE "subscription_plan_limits" SET "monthly_price" = 149.00 WHERE "tier" = 'PREMIUM' AND ("monthly_price" IS NULL OR "monthly_price" = 55.00);

-- Payroll invoice branding / tax (mirrors client invoice settings)
ALTER TABLE "company_invoice_settings" ADD COLUMN IF NOT EXISTS "payroll_prefix" TEXT DEFAULT 'PAY-';
ALTER TABLE "company_invoice_settings" ADD COLUMN IF NOT EXISTS "next_payroll_number" INTEGER DEFAULT 1;
ALTER TABLE "company_invoice_settings" ADD COLUMN IF NOT EXISTS "payroll_tax_enabled" BOOLEAN DEFAULT false;
ALTER TABLE "company_invoice_settings" ADD COLUMN IF NOT EXISTS "payroll_tax_rules" TEXT DEFAULT '[]';
ALTER TABLE "company_invoice_settings" ADD COLUMN IF NOT EXISTS "payroll_default_tax_rule_id" TEXT;
