-- Add closed_at and closed_by columns to accounting_periods table
ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE accounting_periods ADD COLUMN IF NOT EXISTS closed_by TEXT;

-- Add comments to the columns
COMMENT ON COLUMN accounting_periods.closed_at IS 'Fecha y hora en que se cerró el período contable';
COMMENT ON COLUMN accounting_periods.closed_by IS 'Usuario que cerró el período contable';
