-- Stripe billing period start for monthly quota windows (AI, invoices, photo, PDF)
ALTER TABLE "billing_records"
  ADD COLUMN IF NOT EXISTS "current_period_start" TIMESTAMP(3);
