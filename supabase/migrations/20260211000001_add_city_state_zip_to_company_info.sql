-- =====================================================
-- Company Info: city/state/zip
-- Date: 2026-02-11
-- Description: Add city/state/zip columns to company_info
-- =====================================================

alter table public.company_info
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text;
