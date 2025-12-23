-- Allow marking quotes as invoiced

-- Extend quotes.status CHECK constraint to include 'invoiced'
ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('pending','approved','under_review','rejected','expired','invoiced'));
