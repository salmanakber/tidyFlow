-- Multi-step campaign segments: one send per (campaign, lead, step)
ALTER TABLE "sa_sent_emails" ADD COLUMN IF NOT EXISTS "sequence_step" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS "sa_sent_emails_campaign_id_sequence_step_idx" ON "sa_sent_emails"("campaign_id", "sequence_step");
CREATE INDEX IF NOT EXISTS "sa_sent_emails_scheduled_for_idx" ON "sa_sent_emails"("scheduled_for");

-- Allow suppressing follow-up steps without marking FAILED
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'SaEmailDeliveryStatus' AND e.enumlabel = 'CANCELED'
  ) THEN
    ALTER TYPE "SaEmailDeliveryStatus" ADD VALUE 'CANCELED';
  END IF;
END $$;
