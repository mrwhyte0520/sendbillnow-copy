-- Add payment fields for cash receipt printing (AR)

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text;
