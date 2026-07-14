-- Multi-task invoices + hours edit dispute queue

CREATE TABLE IF NOT EXISTS "client_invoice_tasks" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "task_id" INTEGER NOT NULL,
    CONSTRAINT "client_invoice_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_invoice_tasks_invoice_id_task_id_key"
ON "client_invoice_tasks"("invoice_id", "task_id");

CREATE INDEX IF NOT EXISTS "client_invoice_tasks_task_id_idx"
ON "client_invoice_tasks"("task_id");

DO $$ BEGIN
  ALTER TABLE "client_invoice_tasks" ADD CONSTRAINT "client_invoice_tasks_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "client_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "client_invoice_tasks" ADD CONSTRAINT "client_invoice_tasks_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill single-task links
INSERT INTO "client_invoice_tasks" ("invoice_id", "task_id")
SELECT "id", "task_id" FROM "client_invoices"
WHERE "task_id" IS NOT NULL
ON CONFLICT ("invoice_id", "task_id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "hours_edit_requests" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "requester_id" INTEGER NOT NULL,
    "proposed_duration_minutes" INTEGER NOT NULL,
    "current_duration_minutes" INTEGER,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hours_edit_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hours_edit_requests_company_id_status_idx"
ON "hours_edit_requests"("company_id", "status");

CREATE INDEX IF NOT EXISTS "hours_edit_requests_assignment_id_idx"
ON "hours_edit_requests"("assignment_id");

CREATE INDEX IF NOT EXISTS "hours_edit_requests_requester_id_idx"
ON "hours_edit_requests"("requester_id");

DO $$ BEGIN
  ALTER TABLE "hours_edit_requests" ADD CONSTRAINT "hours_edit_requests_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hours_edit_requests" ADD CONSTRAINT "hours_edit_requests_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "task_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hours_edit_requests" ADD CONSTRAINT "hours_edit_requests_requester_id_fkey"
    FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hours_edit_requests" ADD CONSTRAINT "hours_edit_requests_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
