-- Discovery groups: batch leads from one Find Leads search for campaign selection
CREATE TABLE IF NOT EXISTS "sa_discovery_groups" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "countries" TEXT,
    "cities" TEXT,
    "keywords" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "total_chunks" INTEGER NOT NULL DEFAULT 0,
    "completed_chunks" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_discovery_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sa_discovery_group_members" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sa_discovery_group_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sa_discovery_group_members_group_id_company_id_key"
  ON "sa_discovery_group_members"("group_id", "company_id");
CREATE INDEX IF NOT EXISTS "sa_discovery_group_members_group_id_idx" ON "sa_discovery_group_members"("group_id");
CREATE INDEX IF NOT EXISTS "sa_discovery_group_members_company_id_idx" ON "sa_discovery_group_members"("company_id");
CREATE INDEX IF NOT EXISTS "sa_discovery_groups_status_idx" ON "sa_discovery_groups"("status");
CREATE INDEX IF NOT EXISTS "sa_discovery_groups_created_at_idx" ON "sa_discovery_groups"("created_at");

DO $$ BEGIN
  ALTER TABLE "sa_discovery_group_members"
    ADD CONSTRAINT "sa_discovery_group_members_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "sa_discovery_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sa_discovery_group_members"
    ADD CONSTRAINT "sa_discovery_group_members_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "sa_lead_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
