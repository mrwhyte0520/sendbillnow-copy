DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'document_sequences'
  ) THEN
    UPDATE public.document_sequences
    SET prefix = '4873',
        padding = 6,
        updated_at = now()
    WHERE doc_key = 'invoice'
      AND (prefix IS DISTINCT FROM '4873' OR padding IS NULL OR padding < 6);
  END IF;
END;
$$;

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

  INSERT INTO public.document_sequences (tenant_id, doc_key, prefix, next_number, padding, created_at, updated_at)
  VALUES (
    p_tenant_id,
    'invoice',
    '4873',
    1,
    6,
    now(),
    now()
  )
  ON CONFLICT (tenant_id, doc_key) DO NOTHING;

  UPDATE public.document_sequences
  SET prefix = '4873',
      padding = GREATEST(COALESCE(padding, 0), 6),
      next_number = GREATEST(COALESCE(next_number, 1), 1),
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND doc_key = 'invoice';

  UPDATE public.document_sequences
  SET next_number = next_number + 1,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND doc_key = 'invoice'
  RETURNING prefix, padding, (next_number - 1) INTO v_prefix, v_padding, v_issued;

  v_prefix := COALESCE(v_prefix, '4873');
  v_padding := GREATEST(COALESCE(v_padding, 0), 6);

  RETURN v_prefix || lpad(v_issued::text, v_padding, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated;
