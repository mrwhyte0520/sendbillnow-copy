-- =====================================================
-- Public ID Card tokens for QR sharing
-- Date: 2026-02-02
-- Description: Create public_id_cards table + RPC to fetch by token without auth.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.public_id_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  public_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness / lookup
CREATE UNIQUE INDEX IF NOT EXISTS public_id_cards_public_token_uidx
  ON public.public_id_cards(public_token);

CREATE UNIQUE INDEX IF NOT EXISTS public_id_cards_tenant_employee_uidx
  ON public.public_id_cards(tenant_id, employee_user_id);

CREATE INDEX IF NOT EXISTS public_id_cards_tenant_idx
  ON public.public_id_cards(tenant_id);

-- RLS
ALTER TABLE public.public_id_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_id_cards_select ON public.public_id_cards;
CREATE POLICY public_id_cards_select
ON public.public_id_cards
FOR SELECT
TO authenticated
USING ( public.has_tenant_access(tenant_id) );

DROP POLICY IF EXISTS public_id_cards_write ON public.public_id_cards;
CREATE POLICY public_id_cards_write
ON public.public_id_cards
FOR ALL
TO authenticated
USING ( public.has_tenant_access(tenant_id) )
WITH CHECK ( public.has_tenant_access(tenant_id) );

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_public_id_cards_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_id_cards_updated_at ON public.public_id_cards;
CREATE TRIGGER trg_public_id_cards_updated_at
BEFORE UPDATE ON public.public_id_cards
FOR EACH ROW
EXECUTE FUNCTION public.touch_public_id_cards_updated_at();

-- Public RPC (security definer)
CREATE OR REPLACE FUNCTION public.get_public_id_card_by_token(card_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF card_token IS NULL OR trim(card_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'token', c.public_token,
    'payload', c.payload,
    'expires_at', c.public_expires_at
  )
  INTO result
  FROM public.public_id_cards c
  WHERE c.public_token = card_token
    AND (c.public_expires_at IS NULL OR c.public_expires_at > now())
  LIMIT 1;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_id_card_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_id_card_by_token(text) TO authenticated;
