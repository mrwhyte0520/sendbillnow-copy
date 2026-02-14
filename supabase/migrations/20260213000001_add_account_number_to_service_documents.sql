-- Add account_number to service_documents (used by Job Estimate PDF header)
ALTER TABLE public.service_documents
  ADD COLUMN IF NOT EXISTS account_number text;
