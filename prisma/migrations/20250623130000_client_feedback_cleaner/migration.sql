ALTER TABLE "client_feedback" ADD COLUMN IF NOT EXISTS "cleaner_user_id" INTEGER;

CREATE INDEX IF NOT EXISTS "client_feedback_cleaner_user_id_idx" ON "client_feedback"("cleaner_user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_feedback_cleaner_user_id_fkey'
  ) THEN
    ALTER TABLE "client_feedback"
      ADD CONSTRAINT "client_feedback_cleaner_user_id_fkey"
      FOREIGN KEY ("cleaner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
