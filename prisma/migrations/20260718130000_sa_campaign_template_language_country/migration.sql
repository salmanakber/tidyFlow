-- Optional language/country targeting for campaigns & email templates
ALTER TABLE "sa_campaigns" ADD COLUMN IF NOT EXISTS "language" TEXT;
ALTER TABLE "sa_email_templates" ADD COLUMN IF NOT EXISTS "language" TEXT;
ALTER TABLE "sa_email_templates" ADD COLUMN IF NOT EXISTS "country" TEXT;

CREATE INDEX IF NOT EXISTS "sa_campaigns_language_idx" ON "sa_campaigns"("language");
CREATE INDEX IF NOT EXISTS "sa_campaigns_country_idx" ON "sa_campaigns"("country");
CREATE INDEX IF NOT EXISTS "sa_email_templates_language_idx" ON "sa_email_templates"("language");
CREATE INDEX IF NOT EXISTS "sa_email_templates_country_idx" ON "sa_email_templates"("country");
