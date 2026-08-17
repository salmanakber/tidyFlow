-- Announcement auto-hide after expiration date

ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "announcements_expires_at_idx" ON "announcements"("expires_at");
