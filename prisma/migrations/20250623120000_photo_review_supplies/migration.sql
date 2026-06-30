-- Photo QA review workflow
ALTER TABLE "ai_photo_scores" ADD COLUMN IF NOT EXISTS "review_status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "ai_photo_scores" ADD COLUMN IF NOT EXISTS "reviewed_by" INTEGER;
ALTER TABLE "ai_photo_scores" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3);
ALTER TABLE "ai_photo_scores" ADD COLUMN IF NOT EXISTS "review_note" TEXT;

CREATE INDEX IF NOT EXISTS "ai_photo_scores_review_status_idx" ON "ai_photo_scores"("review_status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_photo_scores_reviewed_by_fkey'
  ) THEN
    ALTER TABLE "ai_photo_scores"
      ADD CONSTRAINT "ai_photo_scores_reviewed_by_fkey"
      FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
