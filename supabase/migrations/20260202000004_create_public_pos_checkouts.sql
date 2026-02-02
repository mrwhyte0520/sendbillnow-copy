-- =====================================================
-- Public POS checkout tokens for customer QR flow
-- Date: 2026-02-02
-- Description: Create public_pos_checkouts table + RPCs for public form submission
--              and helper to issue invoice public token.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.public_pos_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  customer_full_name text,
  customer_email text,
  customer_phone text,
  customer_second_email text,
  customer_submitted_at timestamptz,

  invoice_id uuid,
  invoice_public_token text,

  checkout_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  public_expires_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS public_pos_checkouts_checkout_token_uidx
  ON public.public_pos_checkouts(checkout_token);

CREATE INDEX IF NOT EXISTS public_pos_checkouts_tenant_idx
  ON public.public_pos_checkouts(tenant_id);

CREATE INDEX IF NOT EXISTS public_pos_checkouts_invoice_idx
  ON public.public_pos_checkouts(invoice_id);

-- RLS
ALTER TABLE public.public_pos_checkouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_pos_checkouts_select ON public.public_pos_checkouts;
CREATE POLICY public_pos_checkouts_select
ON public.public_pos_checkouts
FOR SELECT
TO authenticated
USING ( public.has_tenant_access(tenant_id) );

DROP POLICY IF EXISTS public_pos_checkouts_write ON public.public_pos_checkouts;
CREATE POLICY public_pos_checkouts_write
ON public.public_pos_checkouts
FOR ALL
TO authenticated
USING ( public.has_tenant_access(tenant_id) )
WITH CHECK ( public.has_tenant_access(tenant_id) );

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_public_pos_checkouts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_pos_checkouts_updated_at ON public.public_pos_checkouts;
CREATE TRIGGER trg_public_pos_checkouts_updated_at
BEFORE UPDATE ON public.public_pos_checkouts
FOR EACH ROW
EXECUTE FUNCTION public.touch_public_pos_checkouts_updated_at();

-- Public RPC: fetch checkout by token (no auth)
CREATE OR REPLACE FUNCTION public.get_public_pos_checkout_by_token(checkout_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF checkout_token IS NULL OR trim(checkout_token) = '' THEN
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
  WHERE c.checkout_token = checkout_token
    AND (c.public_expires_at IS NULL OR c.public_expires_at > now())
  LIMIT 1;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_pos_checkout_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_pos_checkout_by_token(text) TO authenticated;

-- Public RPC: submit customer details (no auth)
CREATE OR REPLACE FUNCTION public.submit_public_pos_checkout_details(
  checkout_token text,
  full_name text,
  email text,
  phone text,
  second_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.public_pos_checkouts;
BEGIN
  IF checkout_token IS NULL OR trim(checkout_token) = '' THEN
    RETURN NULL;
  END IF;

  UPDATE public.public_pos_checkouts c
  SET
    customer_full_name = nullif(trim(full_name), ''),
    customer_email = nullif(trim(email), ''),
    customer_phone = nullif(trim(phone), ''),
    customer_second_email = nullif(trim(second_email), ''),
    customer_submitted_at = now(),
    status = CASE WHEN c.status = 'open' THEN 'details_submitted' ELSE c.status END
  WHERE c.checkout_token = checkout_token
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

-- Helper RPC: issue a public token for an invoice id (auth required)
CREATE OR REPLACE FUNCTION public.issue_invoice_public_token(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invoices;
  tok text;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO inv
  FROM public.invoices
  WHERE id = p_invoice_id
  LIMIT 1;

  IF inv.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Create token if missing
  IF inv.public_token IS NULL OR trim(inv.public_token) = '' THEN
    tok := encode(gen_random_bytes(16), 'hex');
    UPDATE public.invoices
    SET public_token = tok,
        public_expires_at = COALESCE(public_expires_at, now() + interval '30 days')
    WHERE id = p_invoice_id;
    RETURN tok;
  END IF;

  -- Ensure it has a valid expiry
  IF inv.public_expires_at IS NULL OR inv.public_expires_at <= now() THEN
    UPDATE public.invoices
    SET public_expires_at = now() + interval '30 days'
    WHERE id = p_invoice_id;
  END IF;

  RETURN inv.public_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_invoice_public_token(uuid) TO authenticated;
