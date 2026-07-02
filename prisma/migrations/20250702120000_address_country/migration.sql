-- Add company address country for localized geocoding and Places autocomplete
ALTER TABLE "admin_configurations" ADD COLUMN IF NOT EXISTS "address_country" TEXT;
