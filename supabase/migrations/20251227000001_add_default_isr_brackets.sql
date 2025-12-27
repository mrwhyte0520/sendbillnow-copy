-- =====================================================
-- Agregar tramos fiscales ISR por defecto según DGII RD
-- Escala anual vigente para personas físicas
-- =====================================================

-- Agregar columnas faltantes si la tabla ya existe
DO $$
BEGIN
  -- Agregar user_id si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payroll_tax_brackets' 
                 AND column_name = 'user_id') THEN
    ALTER TABLE public.payroll_tax_brackets ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Agregar description si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payroll_tax_brackets' 
                 AND column_name = 'description') THEN
    ALTER TABLE public.payroll_tax_brackets ADD COLUMN description TEXT;
  END IF;

  -- Agregar is_annual si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payroll_tax_brackets' 
                 AND column_name = 'is_annual') THEN
    ALTER TABLE public.payroll_tax_brackets ADD COLUMN is_annual BOOLEAN DEFAULT true;
  END IF;

  -- Agregar is_default si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payroll_tax_brackets' 
                 AND column_name = 'is_default') THEN
    ALTER TABLE public.payroll_tax_brackets ADD COLUMN is_default BOOLEAN DEFAULT false;
  END IF;

  -- Agregar rate_percent si no existe (compatibilidad con rate)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payroll_tax_brackets' 
                 AND column_name = 'rate_percent') THEN
    -- Verificar si existe 'rate' para copiar valores
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_schema = 'public' 
               AND table_name = 'payroll_tax_brackets' 
               AND column_name = 'rate') THEN
      ALTER TABLE public.payroll_tax_brackets ADD COLUMN rate_percent NUMERIC(5,2);
      UPDATE public.payroll_tax_brackets SET rate_percent = rate;
    ELSE
      ALTER TABLE public.payroll_tax_brackets ADD COLUMN rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
    END IF;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error al agregar columnas: %', SQLERRM;
END $$;

-- Crear índice para búsqueda eficiente (ignorar si ya existe)
CREATE INDEX IF NOT EXISTS idx_payroll_tax_brackets_min_amount ON public.payroll_tax_brackets(min_amount);

-- Insertar tramos por defecto DGII si la tabla está vacía
INSERT INTO public.payroll_tax_brackets (min_amount, max_amount, rate_percent, fixed_amount, description, is_annual, is_default)
SELECT * FROM (VALUES
  (0::NUMERIC, 416220.00::NUMERIC, 0::NUMERIC, 0::NUMERIC, 'Renta exenta', true, true),
  (416220.01::NUMERIC, 624329.00::NUMERIC, 15::NUMERIC, 0::NUMERIC, '15% sobre excedente de RD$416,220.01', true, true),
  (624329.01::NUMERIC, 867123.00::NUMERIC, 20::NUMERIC, 31216.00::NUMERIC, 'RD$31,216.00 + 20% sobre excedente de RD$624,329.01', true, true),
  (867123.01::NUMERIC, NULL::NUMERIC, 25::NUMERIC, 79776.00::NUMERIC, 'RD$79,776.00 + 25% sobre excedente de RD$867,123.00', true, true)
) AS v(min_amount, max_amount, rate_percent, fixed_amount, description, is_annual, is_default)
WHERE NOT EXISTS (SELECT 1 FROM public.payroll_tax_brackets LIMIT 1);

-- Comentarios de documentación
COMMENT ON TABLE public.payroll_tax_brackets IS 'Tramos fiscales para cálculo progresivo del ISR según normativa DGII';
COMMENT ON COLUMN public.payroll_tax_brackets.min_amount IS 'Monto mínimo del tramo en RD$';
COMMENT ON COLUMN public.payroll_tax_brackets.max_amount IS 'Monto máximo del tramo en RD$ (NULL = sin límite)';
COMMENT ON COLUMN public.payroll_tax_brackets.fixed_amount IS 'Monto fijo a sumar al impuesto variable';
