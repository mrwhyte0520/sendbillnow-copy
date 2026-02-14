-- Add late fee / bounced check fee fields to sales invoices (AR)

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS late_fee_amount numeric(18,2) default 0,
  ADD COLUMN IF NOT EXISTS bounced_check_fee_amount numeric(18,2) default 0;
