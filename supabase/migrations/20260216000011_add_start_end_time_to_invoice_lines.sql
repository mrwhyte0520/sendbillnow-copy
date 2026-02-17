-- Add optional start/end time fields to AR invoice lines

alter table public.invoice_lines
  add column if not exists start_time text,
  add column if not exists end_time text;
