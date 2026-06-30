-- Company invoice settings
CREATE TABLE "company_invoice_settings" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "company_display_name" TEXT,
    "logo_url" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "tax_registration_number" TEXT,
    "invoice_prefix" TEXT NOT NULL DEFAULT 'INV-',
    "next_invoice_number" INTEGER NOT NULL DEFAULT 1,
    "tax_enabled" BOOLEAN NOT NULL DEFAULT false,
    "tax_rules" TEXT NOT NULL DEFAULT '[]',
    "default_tax_rule_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_invoice_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_invoice_settings_company_id_key" ON "company_invoice_settings"("company_id");

ALTER TABLE "company_invoice_settings" ADD CONSTRAINT "company_invoice_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One Google Sheet per company
CREATE TABLE "company_google_sheets" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "spreadsheet_id" TEXT NOT NULL,
    "spreadsheet_url" TEXT NOT NULL,
    "spreadsheet_title" TEXT,
    "properties_tab" TEXT NOT NULL DEFAULT 'Properties',
    "tasks_tab" TEXT NOT NULL DEFAULT 'Tasks',
    "properties_mapping" TEXT,
    "tasks_mapping" TEXT,
    "unique_column" TEXT,
    "watch_channel_id" TEXT,
    "watch_resource_id" TEXT,
    "watch_expiration" TIMESTAMP(3),
    "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_google_sheets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_google_sheets_company_id_key" ON "company_google_sheets"("company_id");
CREATE INDEX "company_google_sheets_spreadsheet_id_idx" ON "company_google_sheets"("spreadsheet_id");

ALTER TABLE "company_google_sheets" ADD CONSTRAINT "company_google_sheets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
