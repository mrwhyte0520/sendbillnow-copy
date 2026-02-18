ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS htc_portal_only boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS htc_hourly_rate numeric(18,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_htc_portal_only ON public.users(htc_portal_only);

CREATE TABLE IF NOT EXISTS public.htc_service_hours_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  submitted_by uuid NOT NULL,
  submitted_by_email text,
  submitted_by_name text,
  hourly_rate numeric(18,2) DEFAULT 0,
  status text DEFAULT 'submitted',
  submitted_at timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_htc_shs_tenant_id ON public.htc_service_hours_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_htc_shs_submitted_by ON public.htc_service_hours_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_htc_shs_submitted_at ON public.htc_service_hours_submissions(submitted_at);

CREATE TABLE IF NOT EXISTS public.htc_service_hours_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.htc_service_hours_submissions(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  description text,
  start_time text,
  end_time text,
  hours numeric(10,2) DEFAULT 0,
  line_total numeric(18,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_htc_shl_submission_id ON public.htc_service_hours_lines(submission_id);

ALTER TABLE public.htc_service_hours_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.htc_service_hours_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS htc_shs_select ON public.htc_service_hours_submissions;
DROP POLICY IF EXISTS htc_shs_insert ON public.htc_service_hours_submissions;
DROP POLICY IF EXISTS htc_shs_update ON public.htc_service_hours_submissions;
DROP POLICY IF EXISTS htc_shs_delete ON public.htc_service_hours_submissions;

DROP POLICY IF EXISTS htc_shl_select ON public.htc_service_hours_lines;
DROP POLICY IF EXISTS htc_shl_insert ON public.htc_service_hours_lines;
DROP POLICY IF EXISTS htc_shl_update ON public.htc_service_hours_lines;
DROP POLICY IF EXISTS htc_shl_delete ON public.htc_service_hours_lines;

CREATE POLICY htc_shs_select ON public.htc_service_hours_submissions
FOR SELECT
TO authenticated
USING (
  submitted_by = auth.uid()
  OR tenant_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::uuid = auth.uid()
      AND r.name = 'admin'
  )
);

CREATE POLICY htc_shs_insert ON public.htc_service_hours_submissions
FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND public.has_tenant_access(tenant_id)
);

CREATE POLICY htc_shs_update ON public.htc_service_hours_submissions
FOR UPDATE
TO authenticated
USING (
  tenant_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::uuid = auth.uid()
      AND r.name = 'admin'
  )
)
WITH CHECK (
  tenant_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::uuid = auth.uid()
      AND r.name = 'admin'
  )
);

CREATE POLICY htc_shs_delete ON public.htc_service_hours_submissions
FOR DELETE
TO authenticated
USING (
  tenant_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::uuid = auth.uid()
      AND r.name = 'admin'
  )
);

CREATE POLICY htc_shl_select ON public.htc_service_hours_lines
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.htc_service_hours_submissions s
    WHERE s.id = htc_service_hours_lines.submission_id
      AND (
        s.submitted_by = auth.uid()
        OR s.tenant_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id::uuid = auth.uid()
            AND r.name = 'admin'
        )
      )
  )
);

CREATE POLICY htc_shl_insert ON public.htc_service_hours_lines
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.htc_service_hours_submissions s
    WHERE s.id = htc_service_hours_lines.submission_id
      AND (
        s.submitted_by = auth.uid()
        OR s.tenant_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id::uuid = auth.uid()
            AND r.name = 'admin'
        )
      )
  )
);

CREATE POLICY htc_shl_update ON public.htc_service_hours_lines
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.htc_service_hours_submissions s
    WHERE s.id = htc_service_hours_lines.submission_id
      AND (
        s.tenant_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id::uuid = auth.uid()
            AND r.name = 'admin'
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.htc_service_hours_submissions s
    WHERE s.id = htc_service_hours_lines.submission_id
      AND (
        s.tenant_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id::uuid = auth.uid()
            AND r.name = 'admin'
        )
      )
  )
);

CREATE POLICY htc_shl_delete ON public.htc_service_hours_lines
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.htc_service_hours_submissions s
    WHERE s.id = htc_service_hours_lines.submission_id
      AND (
        s.tenant_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id::uuid = auth.uid()
            AND r.name = 'admin'
        )
      )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.htc_service_hours_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.htc_service_hours_lines TO authenticated;
