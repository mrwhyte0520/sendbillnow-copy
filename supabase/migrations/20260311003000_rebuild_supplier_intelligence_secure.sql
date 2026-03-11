-- =====================================================
-- Rebuild Supplier Intelligence (secure multi-tenant)
-- =====================================================

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  tenant_id uuid not null,
  product_name text not null,
  description text not null default '',
  category text not null default 'General',
  supplier_name text not null,
  price numeric(14,2) not null default 0,
  stock numeric(14,2) not null default 0,
  image_url text not null default '',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_products_unique_product_per_supplier_per_business
    unique (business_id, supplier_name, product_name)
);

create index if not exists idx_supplier_products_business_id
  on public.supplier_products (business_id);

create index if not exists idx_supplier_products_tenant_id
  on public.supplier_products (tenant_id);

create index if not exists idx_supplier_products_supplier_name
  on public.supplier_products (supplier_name);

alter table public.supplier_products enable row level security;

-- Drop policies for idempotency
DROP POLICY IF EXISTS supplier_products_select_policy ON public.supplier_products;
DROP POLICY IF EXISTS supplier_products_insert_policy ON public.supplier_products;
DROP POLICY IF EXISTS supplier_products_update_policy ON public.supplier_products;
DROP POLICY IF EXISTS supplier_products_delete_policy ON public.supplier_products;

create policy supplier_products_select_policy
on public.supplier_products
for select
to authenticated
using (
  public.has_tenant_access(tenant_id)
  and exists (
    select 1
    from public.businesses b
    where b.id = supplier_products.business_id
      and b.owner_user_id = supplier_products.tenant_id
  )
);

create policy supplier_products_insert_policy
on public.supplier_products
for insert
to authenticated
with check (
  public.has_tenant_access(tenant_id)
  and exists (
    select 1
    from public.businesses b
    where b.id = supplier_products.business_id
      and b.owner_user_id = supplier_products.tenant_id
  )
);

create policy supplier_products_update_policy
on public.supplier_products
for update
to authenticated
using (
  public.has_tenant_access(tenant_id)
  and exists (
    select 1
    from public.businesses b
    where b.id = supplier_products.business_id
      and b.owner_user_id = supplier_products.tenant_id
  )
)
with check (
  public.has_tenant_access(tenant_id)
  and exists (
    select 1
    from public.businesses b
    where b.id = supplier_products.business_id
      and b.owner_user_id = supplier_products.tenant_id
  )
);

create policy supplier_products_delete_policy
on public.supplier_products
for delete
to authenticated
using (
  public.has_tenant_access(tenant_id)
  and exists (
    select 1
    from public.businesses b
    where b.id = supplier_products.business_id
      and b.owner_user_id = supplier_products.tenant_id
  )
);
