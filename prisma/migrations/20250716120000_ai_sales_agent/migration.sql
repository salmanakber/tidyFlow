-- AI Sales & Outreach Agent (isolated module)
-- CreateEnum
CREATE TYPE "SaLeadStatus" AS ENUM ('NEW', 'ANALYZED', 'QUEUED', 'CONTACTED', 'REPLIED', 'CONVERTED', 'DISCARDED');
CREATE TYPE "SaCampaignStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');
CREATE TYPE "SaTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "SaEmailDeliveryStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'BOUNCED', 'FAILED', 'RETRYING');
CREATE TYPE "SaReplyIntent" AS ENUM ('INTERESTED', 'NOT_INTERESTED', 'BOOK_DEMO', 'NEED_PRICING', 'REQUEST_INFORMATION', 'ALREADY_USING_COMPETITOR', 'WRONG_CONTACT', 'SPAM', 'OTHER');
CREATE TYPE "SaDiscoverySource" AS ENUM ('GOOGLE_PLACES', 'SEARCH_ENGINE', 'MANUAL', 'IMPORT');

-- CreateTable
CREATE TABLE IF NOT EXISTS "sa_lead_companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "website_normalized" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "google_place_id" TEXT,
    "google_rating" DOUBLE PRECISION,
    "review_count" INTEGER,
    "business_status" TEXT,
    "category" TEXT,
    "industry" TEXT,
    "company_size" TEXT,
    "source" "SaDiscoverySource" NOT NULL DEFAULT 'MANUAL',
    "discovery_keyword" TEXT,
    "campaign_id" INTEGER,
    "has_website" BOOLEAN NOT NULL DEFAULT false,
    "has_email" BOOLEAN NOT NULL DEFAULT false,
    "has_phone" BOOLEAN NOT NULL DEFAULT false,
    "last_contacted_at" TIMESTAMP(3),
    "email_sent_count" INTEGER NOT NULL DEFAULT 0,
    "reply_status" TEXT,
    "status" "SaLeadStatus" NOT NULL DEFAULT 'NEW',
    "lead_score" INTEGER,
    "social_links" TEXT,
    "services" TEXT,
    "about_snippet" TEXT,
    "contact_page_url" TEXT,
    "about_page_url" TEXT,
    "crawl_status" TEXT,
    "crawl_error" TEXT,
    "last_crawled_at" TIMESTAMP(3),
    "last_analyzed_at" TIMESTAMP(3),
    "metadata" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_lead_companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_contacts" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_ai_analyses" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "needs_tidyflow" BOOLEAN,
    "has_booking_software" BOOLEAN,
    "has_client_portal" BOOLEAN,
    "has_scheduling_software" BOOLEAN,
    "has_inspection_mgmt" BOOLEAN,
    "has_staff_management" BOOLEAN,
    "website_outdated" BOOLEAN,
    "lead_score" INTEGER NOT NULL,
    "score_reason" TEXT,
    "personalized_intro" TEXT,
    "raw_response" TEXT,
    "prompt_used" TEXT,
    "tokens_used" INTEGER,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_ai_analyses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_email_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html_body" TEXT,
    "text_body" TEXT,
    "status" "SaTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_email_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_email_template_versions" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "html_body" TEXT,
    "text_body" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_email_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_campaigns" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "cities" TEXT,
    "keywords" TEXT,
    "template_id" INTEGER,
    "ai_prompt" TEXT,
    "sending_limit" INTEGER,
    "delay_between_emails" INTEGER NOT NULL DEFAULT 60,
    "max_emails_per_day" INTEGER NOT NULL DEFAULT 50,
    "follow_up_schedule" TEXT,
    "status" "SaCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "discovery_method" TEXT,
    "discovery_config" TEXT,
    "emails_sent" INTEGER NOT NULL DEFAULT 0,
    "leads_discovered" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_sent_emails" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER,
    "campaign_id" INTEGER,
    "template_id" INTEGER,
    "recipient_email" TEXT NOT NULL,
    "recipient_name" TEXT,
    "subject" TEXT NOT NULL,
    "html_body" TEXT,
    "text_body" TEXT,
    "ai_prompt" TEXT,
    "ai_provider" TEXT,
    "delivery_status" "SaEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "smtp_response" TEXT,
    "thread_id" TEXT,
    "message_id" TEXT,
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "scheduled_for" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_sent_emails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_replies" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER,
    "sent_email_id" INTEGER,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "subject" TEXT,
    "body_text" TEXT,
    "body_html" TEXT,
    "thread_id" TEXT,
    "message_id" TEXT,
    "in_reply_to" TEXT,
    "sentiment" TEXT,
    "intent" "SaReplyIntent" NOT NULL DEFAULT 'OTHER',
    "ai_summary" TEXT,
    "is_positive" BOOLEAN,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_replies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_module_settings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "is_encrypted" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updated_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_module_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_system_logs" (
    "id" SERIAL NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "user_id" INTEGER,
    "duration_ms" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_system_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_scheduler_jobs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "cron_expression" TEXT,
    "run_at" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "config" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_scheduler_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_scheduler_runs" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "result" TEXT,
    "error" TEXT,
    CONSTRAINT "sa_scheduler_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_ai_usage_logs" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "action" TEXT NOT NULL,
    "tokens_used" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "latency_ms" INTEGER,
    "company_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes & constraints
CREATE UNIQUE INDEX IF NOT EXISTS "sa_lead_companies_google_place_id_key" ON "sa_lead_companies"("google_place_id");
CREATE UNIQUE INDEX IF NOT EXISTS "sa_lead_companies_website_normalized_key" ON "sa_lead_companies"("website_normalized");
CREATE INDEX IF NOT EXISTS "sa_lead_companies_status_idx" ON "sa_lead_companies"("status");
CREATE INDEX IF NOT EXISTS "sa_lead_companies_city_idx" ON "sa_lead_companies"("city");
CREATE INDEX IF NOT EXISTS "sa_lead_companies_country_idx" ON "sa_lead_companies"("country");
CREATE INDEX IF NOT EXISTS "sa_lead_companies_email_idx" ON "sa_lead_companies"("email");
CREATE INDEX IF NOT EXISTS "sa_lead_companies_lead_score_idx" ON "sa_lead_companies"("lead_score");
CREATE INDEX IF NOT EXISTS "sa_lead_companies_created_at_idx" ON "sa_lead_companies"("created_at");
CREATE INDEX IF NOT EXISTS "sa_lead_companies_campaign_id_idx" ON "sa_lead_companies"("campaign_id");

CREATE INDEX IF NOT EXISTS "sa_contacts_company_id_idx" ON "sa_contacts"("company_id");
CREATE INDEX IF NOT EXISTS "sa_contacts_email_idx" ON "sa_contacts"("email");

CREATE INDEX IF NOT EXISTS "sa_ai_analyses_company_id_idx" ON "sa_ai_analyses"("company_id");
CREATE INDEX IF NOT EXISTS "sa_ai_analyses_lead_score_idx" ON "sa_ai_analyses"("lead_score");
CREATE INDEX IF NOT EXISTS "sa_ai_analyses_created_at_idx" ON "sa_ai_analyses"("created_at");

CREATE INDEX IF NOT EXISTS "sa_email_templates_status_idx" ON "sa_email_templates"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "sa_email_template_versions_template_id_version_key" ON "sa_email_template_versions"("template_id", "version");
CREATE INDEX IF NOT EXISTS "sa_email_template_versions_template_id_idx" ON "sa_email_template_versions"("template_id");

CREATE INDEX IF NOT EXISTS "sa_campaigns_status_idx" ON "sa_campaigns"("status");
CREATE INDEX IF NOT EXISTS "sa_campaigns_created_at_idx" ON "sa_campaigns"("created_at");

CREATE INDEX IF NOT EXISTS "sa_sent_emails_company_id_idx" ON "sa_sent_emails"("company_id");
CREATE INDEX IF NOT EXISTS "sa_sent_emails_campaign_id_idx" ON "sa_sent_emails"("campaign_id");
CREATE INDEX IF NOT EXISTS "sa_sent_emails_delivery_status_idx" ON "sa_sent_emails"("delivery_status");
CREATE INDEX IF NOT EXISTS "sa_sent_emails_recipient_email_idx" ON "sa_sent_emails"("recipient_email");
CREATE INDEX IF NOT EXISTS "sa_sent_emails_sent_at_idx" ON "sa_sent_emails"("sent_at");
CREATE INDEX IF NOT EXISTS "sa_sent_emails_message_id_idx" ON "sa_sent_emails"("message_id");
CREATE INDEX IF NOT EXISTS "sa_sent_emails_created_at_idx" ON "sa_sent_emails"("created_at");

CREATE INDEX IF NOT EXISTS "sa_replies_company_id_idx" ON "sa_replies"("company_id");
CREATE INDEX IF NOT EXISTS "sa_replies_sent_email_id_idx" ON "sa_replies"("sent_email_id");
CREATE INDEX IF NOT EXISTS "sa_replies_intent_idx" ON "sa_replies"("intent");
CREATE INDEX IF NOT EXISTS "sa_replies_received_at_idx" ON "sa_replies"("received_at");

CREATE UNIQUE INDEX IF NOT EXISTS "sa_module_settings_key_key" ON "sa_module_settings"("key");
CREATE INDEX IF NOT EXISTS "sa_module_settings_category_idx" ON "sa_module_settings"("category");

CREATE INDEX IF NOT EXISTS "sa_system_logs_category_idx" ON "sa_system_logs"("category");
CREATE INDEX IF NOT EXISTS "sa_system_logs_level_idx" ON "sa_system_logs"("level");
CREATE INDEX IF NOT EXISTS "sa_system_logs_created_at_idx" ON "sa_system_logs"("created_at");
CREATE INDEX IF NOT EXISTS "sa_system_logs_action_idx" ON "sa_system_logs"("action");

CREATE INDEX IF NOT EXISTS "sa_scheduler_jobs_enabled_idx" ON "sa_scheduler_jobs"("enabled");
CREATE INDEX IF NOT EXISTS "sa_scheduler_jobs_job_type_idx" ON "sa_scheduler_jobs"("job_type");
CREATE INDEX IF NOT EXISTS "sa_scheduler_runs_job_id_idx" ON "sa_scheduler_runs"("job_id");
CREATE INDEX IF NOT EXISTS "sa_scheduler_runs_started_at_idx" ON "sa_scheduler_runs"("started_at");

CREATE INDEX IF NOT EXISTS "sa_ai_usage_logs_provider_idx" ON "sa_ai_usage_logs"("provider");
CREATE INDEX IF NOT EXISTS "sa_ai_usage_logs_created_at_idx" ON "sa_ai_usage_logs"("created_at");

-- Foreign keys (idempotent)
DO $$ BEGIN
  ALTER TABLE "sa_lead_companies" ADD CONSTRAINT "sa_lead_companies_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "sa_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sa_contacts" ADD CONSTRAINT "sa_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "sa_lead_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sa_ai_analyses" ADD CONSTRAINT "sa_ai_analyses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "sa_lead_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sa_email_template_versions" ADD CONSTRAINT "sa_email_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "sa_email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sa_campaigns" ADD CONSTRAINT "sa_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "sa_email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sa_sent_emails" ADD CONSTRAINT "sa_sent_emails_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "sa_lead_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sa_sent_emails" ADD CONSTRAINT "sa_sent_emails_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "sa_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sa_sent_emails" ADD CONSTRAINT "sa_sent_emails_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "sa_email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sa_replies" ADD CONSTRAINT "sa_replies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "sa_lead_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sa_replies" ADD CONSTRAINT "sa_replies_sent_email_id_fkey" FOREIGN KEY ("sent_email_id") REFERENCES "sa_sent_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sa_scheduler_runs" ADD CONSTRAINT "sa_scheduler_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "sa_scheduler_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
