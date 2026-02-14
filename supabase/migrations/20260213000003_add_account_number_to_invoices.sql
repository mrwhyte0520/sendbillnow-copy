-- =====================================================
-- Invoices: Account # column
-- Date: 2026-02-13
-- Description: Store Account # (sequence starts at 11120100) for invoices
-- =====================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS account_number text;
