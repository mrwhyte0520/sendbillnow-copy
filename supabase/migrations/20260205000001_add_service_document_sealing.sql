alter table if exists public.service_documents
  add column if not exists sealed_pdf_path text,
  add column if not exists sealed_email_sent_at timestamptz;

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('service-documents-pdf', 'service-documents-pdf', false)
  on conflict (id) do update
    set name = excluded.name,
        public = excluded.public;
exception
  when undefined_table then
    null;
end $$;
