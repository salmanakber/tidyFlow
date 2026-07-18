-- Template packs: parent + child follow-ups (day 1 / day 3, etc.)
ALTER TABLE "sa_email_templates" ADD COLUMN IF NOT EXISTS "parent_id" INTEGER;
ALTER TABLE "sa_email_templates" ADD COLUMN IF NOT EXISTS "delay_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sa_email_templates" ADD COLUMN IF NOT EXISTS "step_label" TEXT;

CREATE INDEX IF NOT EXISTS "sa_email_templates_parent_id_idx" ON "sa_email_templates"("parent_id");

DO $$ BEGIN
  ALTER TABLE "sa_email_templates"
    ADD CONSTRAINT "sa_email_templates_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "sa_email_templates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
