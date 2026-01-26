-- Cash Finance Module Tables
-- Petty Cash, Expenses, Income, Accounts Payable

-- Petty Cash transactions
CREATE TABLE IF NOT EXISTS public.cash_finance_petty_cash (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  category TEXT NOT NULL DEFAULT 'Miscellaneous',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses
CREATE TABLE IF NOT EXISTS public.cash_finance_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Operations',
  vendor TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Additional Income
CREATE TABLE IF NOT EXISTS public.cash_finance_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  source TEXT,
  category TEXT NOT NULL DEFAULT 'Other Income',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts Payable
CREATE TABLE IF NOT EXISTS public.cash_finance_accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  vendor TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for tenant filtering
CREATE INDEX IF NOT EXISTS idx_cash_finance_petty_cash_tenant ON public.cash_finance_petty_cash(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_finance_expenses_tenant ON public.cash_finance_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_finance_income_tenant ON public.cash_finance_income(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_finance_accounts_payable_tenant ON public.cash_finance_accounts_payable(tenant_id);

-- RLS Policies
ALTER TABLE public.cash_finance_petty_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_finance_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_finance_accounts_payable ENABLE ROW LEVEL SECURITY;

-- Petty Cash RLS
CREATE POLICY "cash_finance_petty_cash_select" ON public.cash_finance_petty_cash
  FOR SELECT USING (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_petty_cash_insert" ON public.cash_finance_petty_cash
  FOR INSERT WITH CHECK (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_petty_cash_update" ON public.cash_finance_petty_cash
  FOR UPDATE USING (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_petty_cash_delete" ON public.cash_finance_petty_cash
  FOR DELETE USING (public.has_tenant_access(tenant_id::uuid));

-- Expenses RLS
CREATE POLICY "cash_finance_expenses_select" ON public.cash_finance_expenses
  FOR SELECT USING (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_expenses_insert" ON public.cash_finance_expenses
  FOR INSERT WITH CHECK (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_expenses_update" ON public.cash_finance_expenses
  FOR UPDATE USING (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_expenses_delete" ON public.cash_finance_expenses
  FOR DELETE USING (public.has_tenant_access(tenant_id::uuid));

-- Income RLS
CREATE POLICY "cash_finance_income_select" ON public.cash_finance_income
  FOR SELECT USING (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_income_insert" ON public.cash_finance_income
  FOR INSERT WITH CHECK (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_income_update" ON public.cash_finance_income
  FOR UPDATE USING (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_income_delete" ON public.cash_finance_income
  FOR DELETE USING (public.has_tenant_access(tenant_id::uuid));

-- Accounts Payable RLS
CREATE POLICY "cash_finance_accounts_payable_select" ON public.cash_finance_accounts_payable
  FOR SELECT USING (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_accounts_payable_insert" ON public.cash_finance_accounts_payable
  FOR INSERT WITH CHECK (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_accounts_payable_update" ON public.cash_finance_accounts_payable
  FOR UPDATE USING (public.has_tenant_access(tenant_id::uuid));
CREATE POLICY "cash_finance_accounts_payable_delete" ON public.cash_finance_accounts_payable
  FOR DELETE USING (public.has_tenant_access(tenant_id::uuid));
