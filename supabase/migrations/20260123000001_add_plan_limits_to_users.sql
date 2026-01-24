-- Add plan limit fields to public.users
-- These fields store the actual limits based on the selected plan

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_warehouses INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_invoices INTEGER DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS billing_period TEXT DEFAULT 'monthly';

-- Add check constraint for billing_period
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_billing_period_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_billing_period_check CHECK (billing_period IN ('monthly', 'annual'));
  END IF;
END $$;

COMMENT ON COLUMN public.users.max_users IS 'Maximum number of users allowed for this plan';
COMMENT ON COLUMN public.users.max_warehouses IS 'Maximum number of inventory warehouses allowed (-1 = unlimited)';
COMMENT ON COLUMN public.users.max_invoices IS 'Maximum number of electronic invoices per month';
COMMENT ON COLUMN public.users.billing_period IS 'Current billing period: monthly or annual';
