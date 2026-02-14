-- =====================================================
-- Service Documents: Account # sequence (Job Estimate)
-- Date: 2026-02-13
-- Description: Generate incremental Account # (starts at 11120100) per tenant
-- =====================================================

-- RPC: atomic increment using public.document_sequences
DROP FUNCTION IF EXISTS public.next_service_document_account_number(uuid);

CREATE OR REPLACE FUNCTION public.next_service_document_account_number(
  p_tenant_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
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

  -- Ensure sequence row exists; start at 11120100
  INSERT INTO public.document_sequences (tenant_id, doc_key, prefix, next_number, padding, created_at, updated_at)
  VALUES (
    p_tenant_id,
    'service_document_account_number',
    '',
    11120100,
    0,
    now(),
    now()
  )
  ON CONFLICT (tenant_id, doc_key) DO NOTHING;

  -- Atomic increment: issue current number, then increment
  UPDATE public.document_sequences
  SET next_number = next_number + 1,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND doc_key = 'service_document_account_number'
  RETURNING (next_number - 1) INTO v_issued;

  RETURN v_issued::text;
END;
$$;

COMMENT ON FUNCTION public.next_service_document_account_number(uuid) IS
  'Atomic Account # generator for service documents per tenant. Starts at 11120100 and increments by 1.';

GRANT EXECUTE ON FUNCTION public.next_service_document_account_number(uuid) TO authenticated;
