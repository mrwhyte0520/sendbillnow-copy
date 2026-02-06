-- =====================================================
-- Service Documents (Job Estimate / Classic Invoice)
-- Date: 2026-02-04
-- Description: Create service_documents + lines + tokens + signatures (+ events)
--              with multi-tenant RLS via public.has_tenant_access(user_id)
-- =====================================================

-- =====================================================
-- SERVICE DOCUMENTS
-- =====================================================

create table if not exists public.service_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  doc_type text not null,
  status text not null default 'Draft',
  doc_number text not null,

  currency char(3) not null default 'USD',

  company_name text,
  company_rnc text,
  company_phone text,
  company_email text,
  company_address text,
  company_logo text,

  client_name text not null,
  client_email text,
  client_phone text,
  client_address text,

  terms_snapshot text not null,

  tax_rate numeric(6,4) not null default 0.1800,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,

  sent_at timestamptz,
  viewed_at timestamptz,
  client_signed_at timestamptz,
  contractor_signed_at timestamptz,
  sealed_at timestamptz,
  expired_at timestamptz,
  voided_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_documents_doc_type_check check (doc_type in ('JOB_ESTIMATE','CLASSIC_INVOICE')),
  constraint service_documents_status_check check (status in ('Draft','Sent','Viewed','ClientSigned','ContractorSigned','Sealed','Expired','Voided'))
);

create unique index if not exists service_documents_user_doc_number_uidx
  on public.service_documents(user_id, doc_number);

create index if not exists idx_service_documents_user_id
  on public.service_documents(user_id);

create index if not exists idx_service_documents_user_status
  on public.service_documents(user_id, status);

create index if not exists idx_service_documents_user_type
  on public.service_documents(user_id, doc_type);

-- Keep updated_at fresh
create or replace function public.touch_service_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_service_documents_updated_at on public.service_documents;
create trigger trg_service_documents_updated_at
before update on public.service_documents
for each row
execute function public.touch_service_documents_updated_at();

-- RLS
alter table public.service_documents enable row level security;

drop policy if exists service_documents_select on public.service_documents;
create policy service_documents_select
on public.service_documents
for select
to authenticated
using ( public.has_tenant_access(user_id) );

drop policy if exists service_documents_write on public.service_documents;
create policy service_documents_write
on public.service_documents
for all
to authenticated
using ( public.has_tenant_access(user_id) )
with check ( public.has_tenant_access(user_id) );

-- =====================================================
-- SERVICE DOCUMENT LINES
-- =====================================================

create table if not exists public.service_document_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.service_documents(id) on delete cascade,

  position int not null default 0,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,

  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  taxable boolean not null default true,
  line_total numeric(12,2) not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists idx_service_document_lines_document_id
  on public.service_document_lines(document_id);

create index if not exists idx_service_document_lines_document_position
  on public.service_document_lines(document_id, position);

create index if not exists idx_service_document_lines_user_document
  on public.service_document_lines(user_id, document_id);

-- RLS
alter table public.service_document_lines enable row level security;

drop policy if exists service_document_lines_select on public.service_document_lines;
create policy service_document_lines_select
on public.service_document_lines
for select
to authenticated
using ( public.has_tenant_access(user_id) );

drop policy if exists service_document_lines_write on public.service_document_lines;
create policy service_document_lines_write
on public.service_document_lines
for all
to authenticated
using ( public.has_tenant_access(user_id) )
with check ( public.has_tenant_access(user_id) );

-- =====================================================
-- SERVICE DOCUMENT TOKENS
-- =====================================================

create table if not exists public.service_document_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.service_documents(id) on delete cascade,

  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  last_used_at timestamptz
);

create unique index if not exists service_document_tokens_token_hash_uidx
  on public.service_document_tokens(token_hash);

create index if not exists idx_service_document_tokens_document
  on public.service_document_tokens(document_id);

create index if not exists idx_service_document_tokens_user_document
  on public.service_document_tokens(user_id, document_id);

-- RLS
alter table public.service_document_tokens enable row level security;

drop policy if exists service_document_tokens_select on public.service_document_tokens;
create policy service_document_tokens_select
on public.service_document_tokens
for select
to authenticated
using ( public.has_tenant_access(user_id) );

drop policy if exists service_document_tokens_write on public.service_document_tokens;
create policy service_document_tokens_write
on public.service_document_tokens
for all
to authenticated
using ( public.has_tenant_access(user_id) )
with check ( public.has_tenant_access(user_id) );

-- =====================================================
-- SERVICE DOCUMENT SIGNATURES
-- =====================================================

create table if not exists public.service_document_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.service_documents(id) on delete cascade,

  client_name text,
  client_signature_image text,
  client_signed_ip text,
  client_signed_user_agent text,
  client_signed_at timestamptz,

  contractor_name text,
  contractor_signature_image text,
  contractor_signed_at timestamptz,

  created_at timestamptz not null default now()
);

create unique index if not exists service_document_signatures_document_uidx
  on public.service_document_signatures(document_id);

create index if not exists idx_service_document_signatures_user_document
  on public.service_document_signatures(user_id, document_id);

-- RLS
alter table public.service_document_signatures enable row level security;

drop policy if exists service_document_signatures_select on public.service_document_signatures;
create policy service_document_signatures_select
on public.service_document_signatures
for select
to authenticated
using ( public.has_tenant_access(user_id) );

drop policy if exists service_document_signatures_write on public.service_document_signatures;
create policy service_document_signatures_write
on public.service_document_signatures
for all
to authenticated
using ( public.has_tenant_access(user_id) )
with check ( public.has_tenant_access(user_id) );

-- =====================================================
-- SERVICE DOCUMENT EVENTS (optional, used for audit trail)
-- =====================================================

create table if not exists public.service_document_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.service_documents(id) on delete cascade,

  event_type text not null,
  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint service_document_events_type_check check (event_type in ('SENT','VIEWED','CLIENT_SIGNED','CONTRACTOR_SIGNED','SEALED','EXPIRED','VOIDED','RESEND'))
);

create index if not exists idx_service_document_events_document
  on public.service_document_events(document_id);

create index if not exists idx_service_document_events_user_document
  on public.service_document_events(user_id, document_id);

create index if not exists idx_service_document_events_user_created_at
  on public.service_document_events(user_id, created_at desc);

-- RLS
alter table public.service_document_events enable row level security;

drop policy if exists service_document_events_select on public.service_document_events;
create policy service_document_events_select
on public.service_document_events
for select
to authenticated
using ( public.has_tenant_access(user_id) );

drop policy if exists service_document_events_write on public.service_document_events;
create policy service_document_events_write
on public.service_document_events
for all
to authenticated
using ( public.has_tenant_access(user_id) )
with check ( public.has_tenant_access(user_id) );
