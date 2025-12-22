alter table public.journal_entries
  add column if not exists source_type text,
  add column if not exists source_id uuid;

create index if not exists journal_entries_source_idx
  on public.journal_entries (source_type, source_id);
