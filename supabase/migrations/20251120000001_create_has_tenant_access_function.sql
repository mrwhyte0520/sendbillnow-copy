-- =====================================================
-- Create has_tenant_access Function for Multi-Tenant RLS
-- Date: 2024-11-20
-- Description: Helper function to determine if the current authenticated user
--              has access to data owned by target_user_id.
--              Returns TRUE if:
--              1. Current user IS the target_user_id (owner access)
--              2. Current user is a sub-user of the target_user_id (via user_roles)
-- =====================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.has_tenant_access(uuid);

-- Create the has_tenant_access function
CREATE OR REPLACE FUNCTION public.has_tenant_access(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- If not authenticated, deny access
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- If the current user IS the target user, grant access
  IF auth.uid() = target_user_id THEN
    RETURN TRUE;
  END IF;

  -- Check if current user is a sub-user of the target_user_id
  -- (via user_roles table where owner_user_id = target_user_id)
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE owner_user_id = target_user_id
      AND user_id = auth.uid()
  );
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.has_tenant_access(uuid) IS
  'Multi-tenant helper: Returns TRUE if current user (auth.uid()) has access to data owned by target_user_id. Access is granted if user is the owner or a sub-user in user_roles.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.has_tenant_access(uuid) TO authenticated;
