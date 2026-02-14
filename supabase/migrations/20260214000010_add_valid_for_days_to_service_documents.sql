-- Add validity window to Job Estimates / Service Documents
-- Date: 2026-02-14

alter table public.service_documents
  add column if not exists valid_for_days int not null default 30;
