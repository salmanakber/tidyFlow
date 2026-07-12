-- QuickBooks Online integration

ALTER TABLE "client_invoices" ADD COLUMN IF NOT EXISTS "quickbooks_invoice_id" TEXT;
ALTER TABLE "client_invoices" ADD COLUMN IF NOT EXISTS "quickbooks_doc_number" TEXT;
ALTER TABLE "client_invoices" ADD COLUMN IF NOT EXISTS "quickbooks_sync_status" TEXT;
ALTER TABLE "client_invoices" ADD COLUMN IF NOT EXISTS "quickbooks_synced_at" TIMESTAMP(3);
ALTER TABLE "client_invoices" ADD COLUMN IF NOT EXISTS "quickbooks_sync_error" TEXT;

CREATE INDEX IF NOT EXISTS "client_invoices_quickbooks_sync_status_idx" ON "client_invoices"("quickbooks_sync_status");

CREATE TABLE IF NOT EXISTS "quickbooks_connections" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "realm_id" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "access_token_exp" TIMESTAMP(3) NOT NULL,
    "refresh_token_exp" TIMESTAMP(3),
    "qb_company_name" TEXT,
    "auto_sync_on_send" BOOLEAN NOT NULL DEFAULT true,
    "auto_sync_on_paid" BOOLEAN NOT NULL DEFAULT true,
    "connected_by_id" INTEGER,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMP(3),
    "invoices_synced" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quickbooks_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quickbooks_connections_company_id_key" ON "quickbooks_connections"("company_id");

CREATE TABLE IF NOT EXISTS "quickbooks_customer_maps" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "client_name" TEXT NOT NULL,
    "client_email" TEXT,
    "quickbooks_customer_id" TEXT NOT NULL,

    CONSTRAINT "quickbooks_customer_maps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quickbooks_customer_maps_company_id_client_name_client_email_key"
ON "quickbooks_customer_maps"("company_id", "client_name", "client_email");

CREATE INDEX IF NOT EXISTS "quickbooks_customer_maps_company_id_idx" ON "quickbooks_customer_maps"("company_id");

CREATE TABLE IF NOT EXISTS "quickbooks_sync_logs" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "invoice_id" INTEGER,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quickbooks_sync_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "quickbooks_sync_logs_company_id_created_at_idx" ON "quickbooks_sync_logs"("company_id", "created_at");

ALTER TABLE "quickbooks_connections" ADD CONSTRAINT "quickbooks_connections_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quickbooks_customer_maps" ADD CONSTRAINT "quickbooks_customer_maps_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quickbooks_sync_logs" ADD CONSTRAINT "quickbooks_sync_logs_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
