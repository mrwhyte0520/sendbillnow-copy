-- Link fixed asset types to depreciation types
alter table public.fixed_asset_types
  add column if not exists depreciation_type_id uuid references public.fixed_asset_depreciation_types(id) on delete set null;

create index if not exists idx_fixed_asset_types_depreciation_type_id
  on public.fixed_asset_types(depreciation_type_id);
