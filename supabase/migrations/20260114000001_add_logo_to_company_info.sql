-- =====================================================
-- Add logo column to company_info table
-- Date: 2026-01-14
-- Description: Adds a TEXT column to store company logo as base64
-- =====================================================

ALTER TABLE public.company_info 
ADD COLUMN IF NOT EXISTS logo TEXT;

COMMENT ON COLUMN public.company_info.logo IS 'Company logo stored as base64 encoded image';
