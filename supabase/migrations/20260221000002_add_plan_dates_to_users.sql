-- Add plan obtained and expiration dates to public.users

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_plan_started_at ON public.users(plan_started_at);
CREATE INDEX IF NOT EXISTS idx_users_plan_expires_at ON public.users(plan_expires_at);
