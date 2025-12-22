alter table public.bank_transfers
  add column if not exists invoice_payments jsonb;

create index if not exists bank_transfers_invoice_payments_gin
  on public.bank_transfers using gin (invoice_payments);
