-- Add address/city/state/zip to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip text;

-- Ensure the public.users row stays in sync with auth.users metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, address, city, state, zip, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NULLIF(NEW.raw_user_meta_data->>'address', ''),
    NULLIF(NEW.raw_user_meta_data->>'city', ''),
    NULLIF(NEW.raw_user_meta_data->>'state', ''),
    NULLIF(NEW.raw_user_meta_data->>'zip', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
      address = COALESCE(EXCLUDED.address, public.users.address),
      city = COALESCE(EXCLUDED.city, public.users.city),
      state = COALESCE(EXCLUDED.state, public.users.state),
      zip = COALESCE(EXCLUDED.zip, public.users.zip),
      updated_at = NOW();

  RETURN NEW;
END;
$$;

-- Backfill profile fields for existing users if present in auth.users metadata
UPDATE public.users u
SET
  address = COALESCE(u.address, NULLIF(au.raw_user_meta_data->>'address', '')),
  city = COALESCE(u.city, NULLIF(au.raw_user_meta_data->>'city', '')),
  state = COALESCE(u.state, NULLIF(au.raw_user_meta_data->>'state', '')),
  zip = COALESCE(u.zip, NULLIF(au.raw_user_meta_data->>'zip', '')),
  updated_at = NOW()
FROM auth.users au
WHERE au.id = u.id;
