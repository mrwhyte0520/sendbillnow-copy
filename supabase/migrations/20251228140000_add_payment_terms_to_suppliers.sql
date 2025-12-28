-- Add payment_terms column to suppliers table
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms TEXT;
