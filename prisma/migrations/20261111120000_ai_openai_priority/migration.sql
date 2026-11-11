-- OpenAI provider + configurable provider priority for TidyFlow AI
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "openai_api_key" TEXT;
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "openai_model" TEXT;
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "openai_vision_model" TEXT;
ALTER TABLE "ai_configurations" ADD COLUMN IF NOT EXISTS "provider_priority" TEXT;
