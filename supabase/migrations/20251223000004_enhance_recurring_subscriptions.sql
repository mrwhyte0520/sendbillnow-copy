-- Agregar campos adicionales a recurring_subscriptions para mejor control de facturación recurrente

-- Campo para aplicar ITBIS automáticamente
ALTER TABLE recurring_subscriptions ADD COLUMN IF NOT EXISTS apply_itbis BOOLEAN DEFAULT true;

-- Campo para guardar la tasa de ITBIS (por defecto 18%)
ALTER TABLE recurring_subscriptions ADD COLUMN IF NOT EXISTS itbis_rate DECIMAL(5,2) DEFAULT 18.00;

-- Campo para evitar duplicados: última fecha de facturación procesada
ALTER TABLE recurring_subscriptions ADD COLUMN IF NOT EXISTS last_billed_date DATE;

-- Campo para vincular facturas con suscripciones (trazabilidad)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES recurring_subscriptions(id) ON DELETE SET NULL;

-- Índice para buscar facturas por suscripción
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON invoices(subscription_id) WHERE subscription_id IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN recurring_subscriptions.apply_itbis IS 'Si se debe aplicar ITBIS automáticamente al generar facturas';
COMMENT ON COLUMN recurring_subscriptions.itbis_rate IS 'Tasa de ITBIS a aplicar (por defecto 18%)';
COMMENT ON COLUMN recurring_subscriptions.last_billed_date IS 'Última fecha en que se generó factura para evitar duplicados';
COMMENT ON COLUMN invoices.subscription_id IS 'Referencia a la suscripción que generó esta factura (para facturación recurrente)';
