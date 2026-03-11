alter table public.supplier_products
  add column if not exists prov text,
  add column if not exists location text not null default '',
  add column if not exists product text,
  add column if not exists external_id text not null default '',
  add column if not exists qty numeric(14,2) not null default 0,
  add column if not exists margin_percent numeric(14,2) not null default 0,
  add column if not exists delivery text not null default '',
  add column if not exists tax numeric(14,4) not null default 0,
  add column if not exists amount numeric(14,2) not null default 0,
  add column if not exists image text not null default '';

update public.supplier_products
set
  prov = coalesce(nullif(prov, ''), supplier_name),
  product = coalesce(nullif(product, ''), product_name),
  qty = coalesce(qty, stock),
  image = coalesce(nullif(image, ''), image_url),
  amount = case
    when coalesce(amount, 0) = 0 then coalesce(price, 0) * coalesce(qty, stock, 0)
    else amount
  end
where true;

create index if not exists idx_supplier_products_external_id
  on public.supplier_products (business_id, external_id);
