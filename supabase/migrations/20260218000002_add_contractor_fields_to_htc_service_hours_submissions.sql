alter table public.htc_service_hours_submissions
  add column if not exists contractor_name text,
  add column if not exists contractor_phone text,
  add column if not exists contractor_address text,
  add column if not exists contractor_city text,
  add column if not exists contractor_state text,
  add column if not exists contractor_zip text;
