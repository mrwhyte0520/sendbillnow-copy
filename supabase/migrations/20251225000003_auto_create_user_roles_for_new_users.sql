-- =====================================================
-- Auto-create user_roles for new authenticated users
-- Date: 2024-12-25
-- Description: Automatically creates a user_roles entry for new users,
--              making them their own tenant owner. This ensures RLS policies
--              work correctly from the start.
-- =====================================================

-- Function to auto-create user_roles entry
CREATE OR REPLACE FUNCTION public.auto_create_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert user_roles entry making the user their own owner
  INSERT INTO public.user_roles (owner_user_id, user_id, role_id)
  VALUES (NEW.id, NEW.id, NULL)
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users (only if it doesn't exist)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_user_role();

-- Backfill existing users who don't have user_roles entries
INSERT INTO public.user_roles (owner_user_id, user_id, role_id)
SELECT id, id, NULL
FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_roles.user_id = auth.users.id
)
ON CONFLICT DO NOTHING;

COMMENT ON FUNCTION public.auto_create_user_role() IS
  'Auto-creates user_roles entry for new users, making them their own tenant owner';
