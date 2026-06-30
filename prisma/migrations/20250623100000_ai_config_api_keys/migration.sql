-- Per-company AI API keys (run after initial tidyflow migration if table already exists)
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "groq_api_key" TEXT;
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "google_api_key" TEXT;
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "google_model" TEXT;
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "google_vision_model" TEXT;
