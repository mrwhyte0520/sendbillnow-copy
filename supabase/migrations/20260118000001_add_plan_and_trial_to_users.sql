-- Add plan/trial fields to public.users for Admin module management

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_plan_status_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_plan_status_check CHECK (plan_status IN ('active', 'inactive', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_plan_id ON public.users(plan_id);
CREATE INDEX IF NOT EXISTS idx_users_trial_end ON public.users(trial_end);
