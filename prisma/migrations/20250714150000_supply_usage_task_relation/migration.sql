-- Link supply usages to tasks for COGS-by-property reporting

CREATE INDEX IF NOT EXISTS "supply_usages_task_id_idx" ON "supply_usages"("task_id");

DO $$ BEGIN
  ALTER TABLE "supply_usages" ADD CONSTRAINT "supply_usages_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
