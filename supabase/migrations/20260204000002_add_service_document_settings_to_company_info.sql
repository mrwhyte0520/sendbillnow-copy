-- =====================================================
-- Service Documents: global settings stored in company_info
-- Date: 2026-02-04
-- Description: Add terms & contractor signature fields to company_info
-- =====================================================

alter table public.company_info
  add column if not exists terms_and_conditions text,
  add column if not exists contractor_signature_name text,
  add column if not exists contractor_signature_image text,
  add column if not exists default_tax_rate numeric(6,4);
