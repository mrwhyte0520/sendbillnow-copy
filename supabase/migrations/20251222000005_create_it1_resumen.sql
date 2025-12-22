create table if not exists public.it1_resumen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  period text not null,
  tipo_declaracion text not null default 'normal',

  total_sales numeric not null default 0,
  itbis_collected numeric not null default 0,
  itbis_withheld numeric not null default 0,

  total_purchases numeric not null default 0,
  itbis_paid numeric not null default 0,

  net_itbis_due numeric not null default 0,

  generated_date timestamptz not null default now(),

  locked boolean not null default false,
  locked_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists it1_resumen_user_period_tipo_uidx
  on public.it1_resumen (user_id, period, tipo_declaracion);

create index if not exists it1_resumen_user_period_idx
  on public.it1_resumen (user_id, period);

create index if not exists it1_resumen_locked_idx
  on public.it1_resumen (user_id, locked);
