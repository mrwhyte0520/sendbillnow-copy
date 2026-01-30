CREATE TABLE IF NOT EXISTS public.job_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  public_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_active boolean NOT NULL DEFAULT true,
  positions jsonb NOT NULL DEFAULT '["Accounting","Customer Support","Sales Representative","Software Developer","Office Assistant"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_portals_user_id_key UNIQUE (user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS job_portals_public_token_uidx
  ON public.job_portals(public_token);

ALTER TABLE public.job_portals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_portals_select" ON public.job_portals;
DROP POLICY IF EXISTS "job_portals_write" ON public.job_portals;

CREATE POLICY "job_portals_select" ON public.job_portals
FOR SELECT
USING (public.has_tenant_access(user_id));

CREATE POLICY "job_portals_write" ON public.job_portals
FOR ALL
USING (public.has_tenant_access(user_id))
WITH CHECK (public.has_tenant_access(user_id));

CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  portal_id uuid NOT NULL REFERENCES public.job_portals(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','interview','accepted','rejected','archived')),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  position text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  cv_filename text,
  cv_mime text,
  cv_base64 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_applications_user_idx ON public.job_applications(user_id);
CREATE INDEX IF NOT EXISTS job_applications_portal_idx ON public.job_applications(portal_id);
CREATE INDEX IF NOT EXISTS job_applications_status_idx ON public.job_applications(status);
CREATE INDEX IF NOT EXISTS job_applications_created_at_idx ON public.job_applications(created_at);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_applications_select" ON public.job_applications;
DROP POLICY IF EXISTS "job_applications_write" ON public.job_applications;

CREATE POLICY "job_applications_select" ON public.job_applications
FOR SELECT
USING (public.has_tenant_access(user_id));

CREATE POLICY "job_applications_write" ON public.job_applications
FOR ALL
USING (public.has_tenant_access(user_id))
WITH CHECK (public.has_tenant_access(user_id));

-- Ensure company name field exists for public job portal display
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_name text;

UPDATE public.users
SET company_name = company
WHERE (company_name IS NULL OR length(trim(company_name)) = 0)
  AND company IS NOT NULL
  AND length(trim(company)) > 0;

CREATE OR REPLACE FUNCTION public.get_job_portal_by_token(job_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF job_token IS NULL OR length(trim(job_token)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'portal', to_jsonb(p),
    'company', jsonb_build_object(
      'id', u.id,
      'name', COALESCE(NULLIF(trim(u.company_name), ''), NULLIF(trim(u.company), ''))
    )
  )
  INTO result
  FROM public.job_portals p
  JOIN public.users u ON u.id = p.user_id
  WHERE p.public_token = job_token
    AND p.is_active = true
  LIMIT 1;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_job_portal_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_job_portal_by_token(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_job_application(
  job_token text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_position text,
  p_answers jsonb DEFAULT '{}'::jsonb,
  p_cv_filename text DEFAULT NULL,
  p_cv_mime text DEFAULT NULL,
  p_cv_base64 text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_id uuid;
  v_user_id uuid;
  v_id uuid;
BEGIN
  IF job_token IS NULL OR length(trim(job_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid portal token';
  END IF;

  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;

  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF p_position IS NULL OR length(trim(p_position)) = 0 THEN
    RAISE EXCEPTION 'Position is required';
  END IF;

  SELECT p.id, p.user_id
  INTO v_portal_id, v_user_id
  FROM public.job_portals p
  WHERE p.public_token = job_token
    AND p.is_active = true
  LIMIT 1;

  IF v_portal_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Portal not found or inactive';
  END IF;

  INSERT INTO public.job_applications (
    user_id,
    portal_id,
    full_name,
    email,
    phone,
    position,
    answers,
    cv_filename,
    cv_mime,
    cv_base64
  )
  VALUES (
    v_user_id,
    v_portal_id,
    trim(p_full_name),
    lower(trim(p_email)),
    NULLIF(trim(p_phone), ''),
    trim(p_position),
    COALESCE(p_answers, '{}'::jsonb),
    NULLIF(p_cv_filename, ''),
    NULLIF(p_cv_mime, ''),
    NULLIF(p_cv_base64, '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_job_application(text, text, text, text, text, jsonb, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_job_application(text, text, text, text, text, jsonb, text, text, text) TO authenticated;
