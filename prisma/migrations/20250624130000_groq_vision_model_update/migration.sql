-- Replace decommissioned Groq vision model with Llama 4 Scout
UPDATE "ai_configurations"
SET "vision_model" = 'meta-llama/llama-4-scout-17b-16e-instruct'
WHERE "vision_model" IN (
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
  'llava-1.5-7b-4096-preview'
);
