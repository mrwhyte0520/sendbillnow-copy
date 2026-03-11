CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_owner_user_id
  ON public.businesses(owner_user_id);

CREATE TABLE IF NOT EXISTS public.supplier_catalog_products (
  id text PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  supplier text NOT NULL,
  product_name text NOT NULL,
  price numeric(18,2) NOT NULL DEFAULT 0,
  stock numeric(18,2) NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'General',
  description text NOT NULL DEFAULT '',
  image_url text,
  sku text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual',
  source_reference text,
  sync_frequency text NOT NULL DEFAULT 'manual',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_products_business_id
  ON public.supplier_catalog_products(business_id);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_products_business_updated_at
  ON public.supplier_catalog_products(business_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_products_business_supplier_sku
  ON public.supplier_catalog_products(business_id, supplier, sku);

CREATE TABLE IF NOT EXISTS public.supplier_catalog_price_history (
  id text PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  product_id text NOT NULL REFERENCES public.supplier_catalog_products(id) ON DELETE CASCADE,
  supplier_id text NOT NULL,
  old_price numeric(18,2) NOT NULL DEFAULT 0,
  new_price numeric(18,2) NOT NULL DEFAULT 0,
  change_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_price_history_business_id
  ON public.supplier_catalog_price_history(business_id);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_price_history_business_change_date
  ON public.supplier_catalog_price_history(business_id, change_date DESC);

CREATE TABLE IF NOT EXISTS public.supplier_catalog_sync_schedules (
  id text PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  supplier text NOT NULL,
  frequency text NOT NULL DEFAULT 'manual',
  source text NOT NULL,
  source_reference text NOT NULL,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_sync_schedules_business_id
  ON public.supplier_catalog_sync_schedules(business_id);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_catalog_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_catalog_sync_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS businesses_select ON public.businesses;
DROP POLICY IF EXISTS businesses_write ON public.businesses;
DROP POLICY IF EXISTS supplier_catalog_products_select ON public.supplier_catalog_products;
DROP POLICY IF EXISTS supplier_catalog_products_write ON public.supplier_catalog_products;
DROP POLICY IF EXISTS supplier_catalog_price_history_select ON public.supplier_catalog_price_history;
DROP POLICY IF EXISTS supplier_catalog_price_history_write ON public.supplier_catalog_price_history;
DROP POLICY IF EXISTS supplier_catalog_sync_schedules_select ON public.supplier_catalog_sync_schedules;
DROP POLICY IF EXISTS supplier_catalog_sync_schedules_write ON public.supplier_catalog_sync_schedules;

CREATE POLICY businesses_select
ON public.businesses
FOR SELECT
TO authenticated
USING (public.has_tenant_access(owner_user_id));

CREATE POLICY businesses_write
ON public.businesses
FOR ALL
TO authenticated
USING (public.has_tenant_access(owner_user_id))
WITH CHECK (public.has_tenant_access(owner_user_id));

CREATE POLICY supplier_catalog_products_select
ON public.supplier_catalog_products
FOR SELECT
TO authenticated
USING (public.has_tenant_access(tenant_id));

CREATE POLICY supplier_catalog_products_write
ON public.supplier_catalog_products
FOR ALL
TO authenticated
USING (public.has_tenant_access(tenant_id))
WITH CHECK (public.has_tenant_access(tenant_id));

CREATE POLICY supplier_catalog_price_history_select
ON public.supplier_catalog_price_history
FOR SELECT
TO authenticated
USING (public.has_tenant_access(tenant_id));

CREATE POLICY supplier_catalog_price_history_write
ON public.supplier_catalog_price_history
FOR ALL
TO authenticated
USING (public.has_tenant_access(tenant_id))
WITH CHECK (public.has_tenant_access(tenant_id));

CREATE POLICY supplier_catalog_sync_schedules_select
ON public.supplier_catalog_sync_schedules
FOR SELECT
TO authenticated
USING (public.has_tenant_access(tenant_id));

CREATE POLICY supplier_catalog_sync_schedules_write
ON public.supplier_catalog_sync_schedules
FOR ALL
TO authenticated
USING (public.has_tenant_access(tenant_id))
WITH CHECK (public.has_tenant_access(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_catalog_products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_catalog_price_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_catalog_sync_schedules TO authenticated;
