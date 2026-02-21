-- Add profile completion fields to customers for phone-only quick add flow
-- Token is used for the public complete-profile page link sent via SMS

alter table public.customers
  add column if not exists profile_completion_token uuid,
  add column if not exists token_expiration timestamptz,
  add column if not exists profile_status text default 'active',
  add column if not exists activated_at timestamptz;

-- Unique index on token for fast lookup (only non-null tokens)
create unique index if not exists idx_customers_profile_completion_token
  on public.customers (profile_completion_token)
  where profile_completion_token is not null;
