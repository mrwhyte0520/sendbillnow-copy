alter table public.company_info
  add column if not exists htc_default_hourly_rate numeric(18,2) default 0;
