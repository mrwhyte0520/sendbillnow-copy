-- Add government-related fields to supplier_types table
-- These fields allow configuring supplier types for government entities

ALTER TABLE supplier_types
ADD COLUMN IF NOT EXISTS is_government BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS default_invoice_type VARCHAR(10) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tax_regime VARCHAR(50) DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN supplier_types.is_government IS 'Indicates if this supplier type is for government/public entities';
COMMENT ON COLUMN supplier_types.default_invoice_type IS 'Default invoice type code (e.g., 15 for Comprobante Gubernamental)';
COMMENT ON COLUMN supplier_types.tax_regime IS 'Tax regime: ordinario, simplificado, exento, especial';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
