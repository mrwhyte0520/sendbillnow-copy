alter table public.report_ir17_data
  add column if not exists beneficiary_type text,
  add column if not exists retention_type text,
  add column if not exists rnc_cedula text,
  add column if not exists beneficiary_name text,
  add column if not exists base_amount numeric,
  add column if not exists source text,
  add column if not exists document_ref text;

create index if not exists report_ir17_data_user_period_beneficiary_idx
  on public.report_ir17_data (user_id, period, beneficiary_type);

create index if not exists report_ir17_data_user_period_retention_idx
  on public.report_ir17_data (user_id, period, retention_type);
