-- =====================================================
-- Add admin RLS policies to public.users
-- Date: 2026-01-18
-- Description: Allow admins to SELECT and UPDATE all users
-- =====================================================

-- Drop existing admin policies if any
DROP POLICY IF EXISTS users_admin_select ON public.users;
DROP POLICY IF EXISTS users_admin_update ON public.users;

-- Admin can SELECT all users
-- Admin is identified by having a user_role with a role named 'admin'
CREATE POLICY users_admin_select ON public.users
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::uuid = auth.uid()
      AND r.name = 'admin'
  )
);

-- Admin can UPDATE all users
CREATE POLICY users_admin_update ON public.users
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::uuid = auth.uid()
      AND r.name = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::uuid = auth.uid()
      AND r.name = 'admin'
  )
);
