-- =====================================================
-- Company Info: default notes
-- Date: 2026-02-06
-- Description: Add default notes for invoices/POS receipts
-- =====================================================

alter table public.company_info
  add column if not exists default_notes text;
