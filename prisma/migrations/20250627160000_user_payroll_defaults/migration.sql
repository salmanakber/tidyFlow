-- Per-employee payroll allowance/deduction defaults (JSON)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payroll_defaults" TEXT;
