-- Optional unit cost for supply COGS on profit margins

ALTER TABLE "supply_items" ADD COLUMN IF NOT EXISTS "unit_cost" DECIMAL(10, 2);
