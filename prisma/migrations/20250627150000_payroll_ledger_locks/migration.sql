-- Immutable payroll ledger: lock source hours when payroll is approved/paid
ALTER TABLE "working_hours_submissions" ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3);
ALTER TABLE "working_hours_submissions" ADD COLUMN IF NOT EXISTS "locked_by" INTEGER;
ALTER TABLE "working_hours_submissions" ADD COLUMN IF NOT EXISTS "payroll_record_id" INTEGER;

ALTER TABLE "payroll_records" ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3);
ALTER TABLE "payroll_records" ADD COLUMN IF NOT EXISTS "locked_by" INTEGER;
ALTER TABLE "payroll_records" ADD COLUMN IF NOT EXISTS "payment_export_ref" TEXT;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payroll_worker_type" TEXT DEFAULT 'hourly';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hire_date" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "working_hours_submissions_payroll_record_id_idx" ON "working_hours_submissions"("payroll_record_id");
CREATE INDEX IF NOT EXISTS "working_hours_submissions_locked_at_idx" ON "working_hours_submissions"("locked_at");
