alter table public.users
  add column if not exists state text,
  add column if not exists zip text;
