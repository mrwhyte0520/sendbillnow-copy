-- Add quote_name column to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_name TEXT;

-- Update existing records to use project value as quote_name if quote_name is null
UPDATE quotes SET quote_name = project WHERE quote_name IS NULL;

-- Add comment to the column
COMMENT ON COLUMN quotes.quote_name IS 'Nombre descriptivo de la cotización';
