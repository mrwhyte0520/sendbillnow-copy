-- Ensure accounting_periods table exists with all required columns
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
  fiscal_year TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  UNIQUE(user_id, name, fiscal_year)
);

-- Add columns if they don't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounting_periods' AND column_name = 'closed_at') THEN
    ALTER TABLE public.accounting_periods ADD COLUMN closed_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounting_periods' AND column_name = 'closed_by') THEN
    ALTER TABLE public.accounting_periods ADD COLUMN closed_by TEXT;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

-- Create or replace policies
DROP POLICY IF EXISTS "accounting_periods_select" ON public.accounting_periods;
DROP POLICY IF EXISTS "accounting_periods_write" ON public.accounting_periods;
DROP POLICY IF EXISTS "accounting_periods_insert" ON public.accounting_periods;
DROP POLICY IF EXISTS "accounting_periods_update" ON public.accounting_periods;
DROP POLICY IF EXISTS "accounting_periods_delete" ON public.accounting_periods;

CREATE POLICY "accounting_periods_select" ON public.accounting_periods
  FOR SELECT
  USING (public.has_tenant_access(user_id));

CREATE POLICY "accounting_periods_insert" ON public.accounting_periods
  FOR INSERT
  WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "accounting_periods_update" ON public.accounting_periods
  FOR UPDATE
  USING (public.has_tenant_access(user_id))
  WITH CHECK (public.has_tenant_access(user_id));

CREATE POLICY "accounting_periods_delete" ON public.accounting_periods
  FOR DELETE
  USING (public.has_tenant_access(user_id));

-- Create index
CREATE INDEX IF NOT EXISTS idx_accounting_periods_user_id ON public.accounting_periods(user_id);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_fiscal_year ON public.accounting_periods(user_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_status ON public.accounting_periods(user_id, status);
