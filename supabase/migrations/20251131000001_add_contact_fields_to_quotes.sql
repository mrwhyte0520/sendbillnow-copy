-- Add contact fields to quotes table
-- These fields store the business and contact information entered when creating a new estimate

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS contact_email text;

-- Add comments for documentation
COMMENT ON COLUMN public.quotes.customer_phone IS 'Business phone number';
COMMENT ON COLUMN public.quotes.address IS 'Business address';
COMMENT ON COLUMN public.quotes.contact_name IS 'Contact person name';
COMMENT ON COLUMN public.quotes.contact_phone IS 'Contact person phone';
COMMENT ON COLUMN public.quotes.contact_email IS 'Contact person email';
