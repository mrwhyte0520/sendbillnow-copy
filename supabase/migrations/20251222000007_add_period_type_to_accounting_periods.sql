-- Add period_type column to distinguish fiscal vs accounting periods
ALTER TABLE public.accounting_periods
  ADD COLUMN IF NOT EXISTS period_type TEXT DEFAULT 'accounting' CHECK (period_type IN ('fiscal', 'accounting'));

-- Update existing periods: fiscal years are those with 12-month span or name contains 'Año Fiscal'
UPDATE public.accounting_periods
SET period_type = 'fiscal'
WHERE name ILIKE '%año fiscal%'
   OR (EXTRACT(MONTH FROM end_date::date) - EXTRACT(MONTH FROM start_date::date) = 11
       AND EXTRACT(DAY FROM start_date::date) = 1
       AND EXTRACT(DAY FROM end_date::date) = 31);

-- Create index for period_type filtering
CREATE INDEX IF NOT EXISTS idx_accounting_periods_period_type
  ON public.accounting_periods (user_id, period_type, fiscal_year);

COMMENT ON COLUMN public.accounting_periods.period_type IS 'Tipo de período: fiscal (anual) o accounting (mensual/contable)';
