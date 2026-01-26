-- =====================================================
-- Invoice number sequence (4873001, 4873002, ...)
-- Date: 2026-01-25
-- Description: Atomic invoice numbering per tenant using document_sequences.
-- =====================================================

-- Atomic RPC: increments invoice sequence and returns the issued invoice number.
-- Format: 4873 + 3-digit padding (e.g. 4873001)
DROP FUNCTION IF EXISTS public.next_invoice_number(uuid);

CREATE OR REPLACE FUNCTION public.next_invoice_number(
  p_tenant_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefix text;
  v_padding int;
  v_issued bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  IF NOT public.has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied for tenant';
  END IF;

  -- Ensure sequence row exists
  INSERT INTO public.document_sequences (tenant_id, doc_key, prefix, next_number, padding, created_at, updated_at)
  VALUES (
    p_tenant_id,
    'invoice',
    '4873',
    1,
    3,
    now(),
    now()
  )
  ON CONFLICT (tenant_id, doc_key) DO NOTHING;

  -- Atomic increment
  UPDATE public.document_sequences
  SET next_number = next_number + 1,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND doc_key = 'invoice'
  RETURNING prefix, padding, (next_number - 1) INTO v_prefix, v_padding, v_issued;

  v_prefix := COALESCE(v_prefix, '4873');
  v_padding := COALESCE(v_padding, 3);

  RETURN v_prefix || lpad(v_issued::text, v_padding, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated;
