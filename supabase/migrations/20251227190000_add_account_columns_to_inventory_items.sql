-- Add accounting account columns to inventory_items table
-- These columns link products to their respective accounting accounts

ALTER TABLE inventory_items
ADD COLUMN IF NOT EXISTS inventory_account_id UUID REFERENCES chart_of_accounts(id),
ADD COLUMN IF NOT EXISTS income_account_id UUID REFERENCES chart_of_accounts(id),
ADD COLUMN IF NOT EXISTS cogs_account_id UUID REFERENCES chart_of_accounts(id),
ADD COLUMN IF NOT EXISTS asset_account_id UUID REFERENCES chart_of_accounts(id);

-- Add comments for documentation
COMMENT ON COLUMN inventory_items.inventory_account_id IS 'Account for inventory asset (typically 114x accounts)';
COMMENT ON COLUMN inventory_items.income_account_id IS 'Account for sales income (typically 4xxx accounts)';
COMMENT ON COLUMN inventory_items.cogs_account_id IS 'Account for cost of goods sold / expenses (typically 5xxx or 6xxx accounts)';
COMMENT ON COLUMN inventory_items.asset_account_id IS 'Account for fixed assets (for fixed_asset item types)';

-- Ensure roles can see/update the new columns (some projects use column-level privileges)
GRANT SELECT, UPDATE (inventory_account_id, income_account_id, cogs_account_id, asset_account_id)
ON TABLE inventory_items
TO authenticated;

GRANT SELECT (inventory_account_id, income_account_id, cogs_account_id, asset_account_id)
ON TABLE inventory_items
TO anon;

-- Force PostgREST to reload schema so new columns are exposed immediately
NOTIFY pgrst, 'reload schema';
