alter table public.bank_transfers
  add column if not exists transfer_type text;

create index if not exists bank_transfers_transfer_type_idx
  on public.bank_transfers (transfer_type);
