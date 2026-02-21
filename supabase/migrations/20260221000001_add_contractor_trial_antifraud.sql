-- Add contractor trial anti-fraud tracking and trial plan binding

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trial_plan_id TEXT;

CREATE INDEX IF NOT EXISTS idx_users_trial_plan_id ON public.users(trial_plan_id);

CREATE TABLE IF NOT EXISTS public.trial_device_claims (
  device_id TEXT PRIMARY KEY,
  first_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_user_email TEXT,
  plan_id TEXT,
  claimed_at TIMESTAMPTZ DEFAULT now(),
  last_claimed_at TIMESTAMPTZ DEFAULT now(),
  claim_count INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_trial_device_claims_first_user_id ON public.trial_device_claims(first_user_id);
CREATE INDEX IF NOT EXISTS idx_trial_device_claims_claimed_at ON public.trial_device_claims(claimed_at);

ALTER TABLE public.trial_device_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trial_device_claims_no_access" ON public.trial_device_claims;

CREATE POLICY "trial_device_claims_no_access" ON public.trial_device_claims
FOR ALL
USING (false)
WITH CHECK (false);
