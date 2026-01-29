-- Add quote_number column to quotes table for human-friendly estimate numbers
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_number TEXT;

COMMENT ON COLUMN quotes.quote_number IS 'Número visible de la cotización (patrón 4873...)';
