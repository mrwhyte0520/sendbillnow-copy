alter table public.bank_transfers
  add column if not exists supplier_id uuid;

create index if not exists bank_transfers_supplier_id_idx
  on public.bank_transfers (supplier_id);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints tc
    where tc.constraint_schema = 'public'
      and tc.table_name = 'bank_transfers'
      and tc.constraint_name = 'bank_transfers_supplier_id_fkey'
  ) then
    alter table public.bank_transfers
      add constraint bank_transfers_supplier_id_fkey
      foreign key (supplier_id)
      references public.suppliers (id)
      on delete set null;
  end if;
end $$;
