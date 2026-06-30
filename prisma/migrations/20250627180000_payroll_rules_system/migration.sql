-- Employee recurring payroll rules
CREATE TABLE IF NOT EXISTS "employee_payroll_rules" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "effective_start" TIMESTAMP(3) NOT NULL,
    "effective_end" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_payroll_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "employee_payroll_rules_user_id_idx" ON "employee_payroll_rules"("user_id");
CREATE INDEX IF NOT EXISTS "employee_payroll_rules_company_id_idx" ON "employee_payroll_rules"("company_id");
CREATE INDEX IF NOT EXISTS "employee_payroll_rules_status_idx" ON "employee_payroll_rules"("status");
CREATE INDEX IF NOT EXISTS "employee_payroll_rules_effective_start_effective_end_idx" ON "employee_payroll_rules"("effective_start", "effective_end");

ALTER TABLE "employee_payroll_rules" ADD CONSTRAINT "employee_payroll_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_payroll_rules" ADD CONSTRAINT "employee_payroll_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Payroll line item snapshots
CREATE TABLE IF NOT EXISTS "payroll_line_items" (
    "id" SERIAL NOT NULL,
    "payroll_record_id" INTEGER NOT NULL,
    "source_rule_id" INTEGER,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_line_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payroll_line_items_payroll_record_id_idx" ON "payroll_line_items"("payroll_record_id");
CREATE INDEX IF NOT EXISTS "payroll_line_items_source_rule_id_idx" ON "payroll_line_items"("source_rule_id");

ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_payroll_record_id_fkey" FOREIGN KEY ("payroll_record_id") REFERENCES "payroll_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_source_rule_id_fkey" FOREIGN KEY ("source_rule_id") REFERENCES "employee_payroll_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
