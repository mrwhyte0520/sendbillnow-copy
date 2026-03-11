CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_owner_user_id
  ON public.businesses(owner_user_id);

CREATE OR REPLACE FUNCTION public.has_business_access(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = target_business_id
      AND public.has_tenant_access(b.owner_user_id)
  );
$$;

DO $$
BEGIN
  INSERT INTO public.businesses (owner_user_id, name)
  SELECT src.owner_user_id,
         COALESCE(NULLIF(BTRIM(p.email), ''), NULLIF(BTRIM(u.email::text), ''), 'Business') AS name
  FROM (
    SELECT DISTINCT owner_user_id
    FROM public.user_roles
    WHERE owner_user_id IS NOT NULL
  ) src
  LEFT JOIN public.profiles p
    ON p.id = src.owner_user_id
  INNER JOIN auth.users u
    ON u.id = src.owner_user_id
  WHERE u.id IS NOT NULL
  ON CONFLICT (owner_user_id) DO UPDATE
  SET name = EXCLUDED.name
  WHERE public.businesses.name IS NULL
     OR BTRIM(public.businesses.name) = '';
END $$;

DO $$
BEGIN
  IF to_regclass('public.supplier_catalog_products') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO public.businesses (owner_user_id, name)
      SELECT DISTINCT p.tenant_id,
             COALESCE(NULLIF(BTRIM(pr.email), ''''), NULLIF(BTRIM(u.email::text), ''''), ''Business'')
      FROM public.supplier_catalog_products p
      LEFT JOIN public.profiles pr
        ON pr.id = p.tenant_id
      INNER JOIN auth.users u
        ON u.id = p.tenant_id
      WHERE p.tenant_id IS NOT NULL
        AND u.id IS NOT NULL
      ON CONFLICT (owner_user_id) DO UPDATE
      SET name = EXCLUDED.name
      WHERE public.businesses.name IS NULL
         OR BTRIM(public.businesses.name) = ''''
    ';

    EXECUTE 'ALTER TABLE public.supplier_catalog_products ADD COLUMN IF NOT EXISTS business_id uuid';
    EXECUTE '
      UPDATE public.supplier_catalog_products p
      SET business_id = b.id
      FROM public.businesses b
      WHERE p.business_id IS NULL
        AND p.tenant_id = b.owner_user_id
    ';

    IF EXISTS (
      SELECT 1
      FROM public.supplier_catalog_products
      WHERE business_id IS NULL
    ) THEN
      RAISE EXCEPTION 'supplier_catalog_products contains rows without business_id';
    END IF;

    EXECUTE 'ALTER TABLE public.supplier_catalog_products ALTER COLUMN business_id SET NOT NULL';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'supplier_catalog_products_business_id_fkey'
        AND conrelid = 'public.supplier_catalog_products'::regclass
    ) THEN
      EXECUTE '
        ALTER TABLE public.supplier_catalog_products
        ADD CONSTRAINT supplier_catalog_products_business_id_fkey
        FOREIGN KEY (business_id)
        REFERENCES public.businesses(id)
        ON DELETE CASCADE
      ';
    END IF;

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_supplier_catalog_products_business_id ON public.supplier_catalog_products(business_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_supplier_catalog_products_business_updated_at ON public.supplier_catalog_products(business_id, updated_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_supplier_catalog_products_business_supplier_sku ON public.supplier_catalog_products(business_id, supplier, sku)';
    EXECUTE 'ALTER TABLE public.supplier_catalog_products ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.supplier_catalog_products FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS supplier_catalog_products_select ON public.supplier_catalog_products';
    EXECUTE 'DROP POLICY IF EXISTS supplier_catalog_products_write ON public.supplier_catalog_products';
    EXECUTE '
      CREATE POLICY supplier_catalog_products_select
      ON public.supplier_catalog_products
      FOR SELECT
      TO authenticated
      USING (public.has_tenant_access(tenant_id))
    ';
    EXECUTE '
      CREATE POLICY supplier_catalog_products_write
      ON public.supplier_catalog_products
      FOR ALL
      TO authenticated
      USING (public.has_tenant_access(tenant_id))
      WITH CHECK (public.has_tenant_access(tenant_id))
    ';
    EXECUTE 'REVOKE ALL ON public.supplier_catalog_products FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_catalog_products TO authenticated';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.supplier_catalog_price_history') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO public.businesses (owner_user_id, name)
      SELECT DISTINCT h.tenant_id,
             COALESCE(NULLIF(BTRIM(pr.email), ''''), NULLIF(BTRIM(u.email::text), ''''), ''Business'')
      FROM public.supplier_catalog_price_history h
      LEFT JOIN public.profiles pr
        ON pr.id = h.tenant_id
      INNER JOIN auth.users u
        ON u.id = h.tenant_id
      WHERE h.tenant_id IS NOT NULL
        AND u.id IS NOT NULL
      ON CONFLICT (owner_user_id) DO UPDATE
      SET name = EXCLUDED.name
      WHERE public.businesses.name IS NULL
         OR BTRIM(public.businesses.name) = ''''
    ';

    EXECUTE 'ALTER TABLE public.supplier_catalog_price_history ADD COLUMN IF NOT EXISTS business_id uuid';
    EXECUTE '
      UPDATE public.supplier_catalog_price_history h
      SET business_id = b.id
      FROM public.businesses b
      WHERE h.business_id IS NULL
        AND h.tenant_id = b.owner_user_id
    ';

    IF EXISTS (
      SELECT 1
      FROM public.supplier_catalog_price_history
      WHERE business_id IS NULL
    ) THEN
      RAISE EXCEPTION 'supplier_catalog_price_history contains rows without business_id';
    END IF;

    EXECUTE 'ALTER TABLE public.supplier_catalog_price_history ALTER COLUMN business_id SET NOT NULL';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'supplier_catalog_price_history_business_id_fkey'
        AND conrelid = 'public.supplier_catalog_price_history'::regclass
    ) THEN
      EXECUTE '
        ALTER TABLE public.supplier_catalog_price_history
        ADD CONSTRAINT supplier_catalog_price_history_business_id_fkey
        FOREIGN KEY (business_id)
        REFERENCES public.businesses(id)
        ON DELETE CASCADE
      ';
    END IF;

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_supplier_catalog_price_history_business_id ON public.supplier_catalog_price_history(business_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_supplier_catalog_price_history_business_change_date ON public.supplier_catalog_price_history(business_id, change_date DESC)';
    EXECUTE 'ALTER TABLE public.supplier_catalog_price_history ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.supplier_catalog_price_history FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS supplier_catalog_price_history_select ON public.supplier_catalog_price_history';
    EXECUTE 'DROP POLICY IF EXISTS supplier_catalog_price_history_write ON public.supplier_catalog_price_history';
    EXECUTE '
      CREATE POLICY supplier_catalog_price_history_select
      ON public.supplier_catalog_price_history
      FOR SELECT
      TO authenticated
      USING (public.has_tenant_access(tenant_id))
    ';
    EXECUTE '
      CREATE POLICY supplier_catalog_price_history_write
      ON public.supplier_catalog_price_history
      FOR ALL
      TO authenticated
      USING (public.has_tenant_access(tenant_id))
      WITH CHECK (public.has_tenant_access(tenant_id))
    ';
    EXECUTE 'REVOKE ALL ON public.supplier_catalog_price_history FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_catalog_price_history TO authenticated';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.supplier_catalog_sync_schedules') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO public.businesses (owner_user_id, name)
      SELECT DISTINCT s.tenant_id,
             COALESCE(NULLIF(BTRIM(pr.email), ''''), NULLIF(BTRIM(u.email::text), ''''), ''Business'')
      FROM public.supplier_catalog_sync_schedules s
      LEFT JOIN public.profiles pr
        ON pr.id = s.tenant_id
      INNER JOIN auth.users u
        ON u.id = s.tenant_id
      WHERE s.tenant_id IS NOT NULL
        AND u.id IS NOT NULL
      ON CONFLICT (owner_user_id) DO UPDATE
      SET name = EXCLUDED.name
      WHERE public.businesses.name IS NULL
         OR BTRIM(public.businesses.name) = ''''
    ';

    EXECUTE 'ALTER TABLE public.supplier_catalog_sync_schedules ADD COLUMN IF NOT EXISTS business_id uuid';
    EXECUTE '
      UPDATE public.supplier_catalog_sync_schedules s
      SET business_id = b.id
      FROM public.businesses b
      WHERE s.business_id IS NULL
        AND s.tenant_id = b.owner_user_id
    ';

    IF EXISTS (
      SELECT 1
      FROM public.supplier_catalog_sync_schedules
      WHERE business_id IS NULL
    ) THEN
      RAISE EXCEPTION 'supplier_catalog_sync_schedules contains rows without business_id';
    END IF;

    EXECUTE 'ALTER TABLE public.supplier_catalog_sync_schedules ALTER COLUMN business_id SET NOT NULL';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'supplier_catalog_sync_schedules_business_id_fkey'
        AND conrelid = 'public.supplier_catalog_sync_schedules'::regclass
    ) THEN
      EXECUTE '
        ALTER TABLE public.supplier_catalog_sync_schedules
        ADD CONSTRAINT supplier_catalog_sync_schedules_business_id_fkey
        FOREIGN KEY (business_id)
        REFERENCES public.businesses(id)
        ON DELETE CASCADE
      ';
    END IF;

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_supplier_catalog_sync_schedules_business_id ON public.supplier_catalog_sync_schedules(business_id)';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_catalog_sync_schedules_business_source ON public.supplier_catalog_sync_schedules(business_id, supplier, source, source_reference)';
    EXECUTE 'ALTER TABLE public.supplier_catalog_sync_schedules ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.supplier_catalog_sync_schedules FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS supplier_catalog_sync_schedules_select ON public.supplier_catalog_sync_schedules';
    EXECUTE 'DROP POLICY IF EXISTS supplier_catalog_sync_schedules_write ON public.supplier_catalog_sync_schedules';
    EXECUTE '
      CREATE POLICY supplier_catalog_sync_schedules_select
      ON public.supplier_catalog_sync_schedules
      FOR SELECT
      TO authenticated
      USING (public.has_tenant_access(tenant_id))
    ';
    EXECUTE '
      CREATE POLICY supplier_catalog_sync_schedules_write
      ON public.supplier_catalog_sync_schedules
      FOR ALL
      TO authenticated
      USING (public.has_tenant_access(tenant_id))
      WITH CHECK (public.has_tenant_access(tenant_id))
    ';
    EXECUTE 'REVOKE ALL ON public.supplier_catalog_sync_schedules FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_catalog_sync_schedules TO authenticated';
  END IF;
END $$;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS businesses_select ON public.businesses;
DROP POLICY IF EXISTS businesses_write ON public.businesses;

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

REVOKE ALL ON public.businesses FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_business_access(uuid) TO authenticated;
