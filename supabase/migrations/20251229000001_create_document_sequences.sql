-- =====================================================
-- Create document_sequences + next_document_number RPC
-- Date: 2025-12-29
-- Description: Atomic, configurable document numbering per tenant and document key.
-- =====================================================

-- Table to store per-tenant sequences
CREATE TABLE IF NOT EXISTS public.document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  doc_key text NOT NULL,
  prefix text NOT NULL DEFAULT '',
  next_number bigint NOT NULL DEFAULT 1,
  padding int NOT NULL DEFAULT 6,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_sequences_tenant_doc_key_key UNIQUE (tenant_id, doc_key)
);

COMMENT ON TABLE public.document_sequences IS 'Per-tenant document numbering sequences (atomic increments via RPC).';
COMMENT ON COLUMN public.document_sequences.doc_key IS 'Logical key for the document type, e.g. warehouse_transfer, invoice, etc.';

ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_sequences_read" ON public.document_sequences;
CREATE POLICY "document_sequences_read"
ON public.document_sequences
FOR SELECT
TO authenticated
USING (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "document_sequences_write" ON public.document_sequences;
CREATE POLICY "document_sequences_write"
ON public.document_sequences
FOR ALL
TO authenticated
USING (public.has_tenant_access(tenant_id))
WITH CHECK (public.has_tenant_access(tenant_id));

CREATE INDEX IF NOT EXISTS idx_document_sequences_tenant_key
ON public.document_sequences (tenant_id, doc_key);

-- Atomic RPC: increments sequence and returns formatted document number.
DROP FUNCTION IF EXISTS public.next_document_number(uuid, text, text, int);

CREATE OR REPLACE FUNCTION public.next_document_number(
  p_tenant_id uuid,
  p_doc_key text,
  p_prefix text DEFAULT NULL,
  p_padding int DEFAULT NULL
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

  IF p_tenant_id IS NULL OR p_doc_key IS NULL OR length(trim(p_doc_key)) = 0 THEN
    RAISE EXCEPTION 'tenant_id and doc_key are required';
  END IF;

  IF NOT public.has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied for tenant';
  END IF;

  -- Ensure row exists
  INSERT INTO public.document_sequences (tenant_id, doc_key, prefix, next_number, padding, created_at, updated_at)
  VALUES (
    p_tenant_id,
    p_doc_key,
    COALESCE(p_prefix, 'TRF'),
    1,
    COALESCE(p_padding, 6),
    now(),
    now()
  )
  ON CONFLICT (tenant_id, doc_key) DO NOTHING;

  -- Atomic increment, returning the issued number
  UPDATE public.document_sequences
  SET next_number = next_number + 1,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND doc_key = p_doc_key
  RETURNING prefix, padding, (next_number - 1) INTO v_prefix, v_padding, v_issued;

  IF v_prefix IS NULL THEN
    v_prefix := COALESCE(p_prefix, 'TRF');
  END IF;
  IF v_padding IS NULL THEN
    v_padding := COALESCE(p_padding, 6);
  END IF;

  RETURN v_prefix || '-' || lpad(v_issued::text, v_padding, '0');
END;
$$;

COMMENT ON FUNCTION public.next_document_number(uuid, text, text, int) IS
  'Atomic next document number generator per tenant and doc_key. Returns formatted number prefix-000001.';

GRANT EXECUTE ON FUNCTION public.next_document_number(uuid, text, text, int) TO authenticated;

-- Preview RPC: returns the next number WITHOUT incrementing (for UI display)
DROP FUNCTION IF EXISTS public.peek_document_number(uuid, text, text, int);

CREATE OR REPLACE FUNCTION public.peek_document_number(
  p_tenant_id uuid,
  p_doc_key text,
  p_prefix text DEFAULT NULL,
  p_padding int DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefix text;
  v_padding int;
  v_next bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL OR p_doc_key IS NULL OR length(trim(p_doc_key)) = 0 THEN
    RAISE EXCEPTION 'tenant_id and doc_key are required';
  END IF;

  IF NOT public.has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied for tenant';
  END IF;

  -- Ensure row exists
  INSERT INTO public.document_sequences (tenant_id, doc_key, prefix, next_number, padding, created_at, updated_at)
  VALUES (
    p_tenant_id,
    p_doc_key,
    COALESCE(p_prefix, 'TRF'),
    1,
    COALESCE(p_padding, 6),
    now(),
    now()
  )
  ON CONFLICT (tenant_id, doc_key) DO NOTHING;

  SELECT prefix, padding, next_number
  INTO v_prefix, v_padding, v_next
  FROM public.document_sequences
  WHERE tenant_id = p_tenant_id
    AND doc_key = p_doc_key;

  v_prefix := COALESCE(v_prefix, p_prefix, 'TRF');
  v_padding := COALESCE(v_padding, p_padding, 6);
  v_next := COALESCE(v_next, 1);

  RETURN v_prefix || '-' || lpad(v_next::text, v_padding, '0');
END;
$$;

COMMENT ON FUNCTION public.peek_document_number(uuid, text, text, int) IS
  'Preview next document number per tenant and doc_key without incrementing. Use for UI display.';

GRANT EXECUTE ON FUNCTION public.peek_document_number(uuid, text, text, int) TO authenticated;
