-- =====================================================
-- Fix ambiguous parameter names in public POS checkout RPCs
-- Date: 2026-02-02
-- =====================================================

-- Postgres cannot rename input parameters via CREATE OR REPLACE.
-- Drop old signatures first.
DROP FUNCTION IF EXISTS public.get_public_pos_checkout_by_token(text);
DROP FUNCTION IF EXISTS public.submit_public_pos_checkout_details(text, text, text, text, text);

-- Public RPC: fetch checkout by token (no auth)
CREATE OR REPLACE FUNCTION public.get_public_pos_checkout_by_token(p_checkout_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_checkout_token IS NULL OR trim(p_checkout_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'token', c.checkout_token,
    'status', c.status,
    'payload', c.payload,
    'expires_at', c.public_expires_at,
    'customer_submitted_at', c.customer_submitted_at,
    'invoice_public_token', c.invoice_public_token
  )
  INTO result
  FROM public.public_pos_checkouts c
  WHERE c.checkout_token = p_checkout_token
    AND (c.public_expires_at IS NULL OR c.public_expires_at > now())
  LIMIT 1;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_pos_checkout_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_pos_checkout_by_token(text) TO authenticated;

-- Public RPC: submit customer details (no auth)
CREATE OR REPLACE FUNCTION public.submit_public_pos_checkout_details(
  p_checkout_token text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_second_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.public_pos_checkouts;
BEGIN
  IF p_checkout_token IS NULL OR trim(p_checkout_token) = '' THEN
    RETURN NULL;
  END IF;

  UPDATE public.public_pos_checkouts c
  SET
    customer_full_name = nullif(trim(p_full_name), ''),
    customer_email = nullif(trim(p_email), ''),
    customer_phone = nullif(trim(p_phone), ''),
    customer_second_email = nullif(trim(p_second_email), ''),
    customer_submitted_at = now(),
    status = CASE WHEN c.status = 'open' THEN 'details_submitted' ELSE c.status END
  WHERE c.checkout_token = p_checkout_token
    AND (c.public_expires_at IS NULL OR c.public_expires_at > now())
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', updated.status,
    'customer_submitted_at', updated.customer_submitted_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_pos_checkout_details(text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_public_pos_checkout_details(text, text, text, text, text) TO authenticated;
