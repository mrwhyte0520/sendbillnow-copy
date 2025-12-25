-- Migration: Add IR-17 retention categories and complementary retributions
-- This enables proper classification of withholdings for the IR-17 report

-- 1. Add retention_category to ap_invoices for IR-17 classification
ALTER TABLE ap_invoices 
ADD COLUMN IF NOT EXISTS retention_category TEXT DEFAULT NULL;

COMMENT ON COLUMN ap_invoices.retention_category IS 
'IR-17 retention category: alquileres, honorarios, premios, dividendos, intereses_no_residentes, remesas_exterior, pagos_estado, juegos, ganancias_capital, otras_rentas, otras_retenciones';

-- 2. Create table for complementary retributions (Retribuciones Complementarias - 27%)
CREATE TABLE IF NOT EXISTS complementary_retributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    period TEXT NOT NULL, -- Format: YYYY-MM
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    employee_name TEXT,
    employee_rnc TEXT,
    retribution_type TEXT NOT NULL, -- vehiculo, vivienda, seguro, educacion, otros
    description TEXT,
    gross_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    tax_rate DECIMAL(5,2) NOT NULL DEFAULT 27.00,
    tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_complementary_retributions_user_period 
ON complementary_retributions(user_id, period);

-- RLS policies
ALTER TABLE complementary_retributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own complementary retributions"
ON complementary_retributions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own complementary retributions"
ON complementary_retributions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own complementary retributions"
ON complementary_retributions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own complementary retributions"
ON complementary_retributions FOR DELETE
USING (auth.uid() = user_id);

-- 3. Add export_type to invoices for IT-1 classification
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS sale_classification TEXT DEFAULT 'gravada';

COMMENT ON COLUMN invoices.sale_classification IS 
'IT-1 sale classification: gravada, exenta, exenta_destino, exportacion_bienes, exportacion_servicios';

-- 4. Add report_ir17_data columns for detailed retention info
ALTER TABLE report_ir17_data 
ADD COLUMN IF NOT EXISTS retention_category TEXT DEFAULT NULL;

ALTER TABLE report_ir17_data 
ADD COLUMN IF NOT EXISTS ir17_casilla INTEGER DEFAULT NULL;

COMMENT ON COLUMN report_ir17_data.retention_category IS 'IR-17 retention category for casilla mapping';
COMMENT ON COLUMN report_ir17_data.ir17_casilla IS 'IR-17 casilla number (1-22)';
