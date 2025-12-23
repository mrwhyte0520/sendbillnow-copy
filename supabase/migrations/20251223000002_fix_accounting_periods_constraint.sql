-- Fix unique constraint on accounting_periods
-- The constraint 'unique_period_name' only on 'name' is incorrect
-- It should be on (user_id, name) to allow different users to have periods with the same name

-- Drop the incorrect constraint if it exists
DO $$
BEGIN
  -- Try to drop constraint by various possible names
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_period_name') THEN
    ALTER TABLE public.accounting_periods DROP CONSTRAINT unique_period_name;
    RAISE NOTICE 'Dropped constraint unique_period_name';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_periods_name_key') THEN
    ALTER TABLE public.accounting_periods DROP CONSTRAINT accounting_periods_name_key;
    RAISE NOTICE 'Dropped constraint accounting_periods_name_key';
  END IF;
END $$;

-- Ensure the correct unique constraint exists (user_id + name)
-- This allows different users to have periods with the same name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'accounting_periods_user_id_name_unique'
  ) THEN
    -- First check if there are duplicates that would prevent creating the constraint
    -- If there are, we need to handle them
    ALTER TABLE public.accounting_periods 
    ADD CONSTRAINT accounting_periods_user_id_name_unique 
    UNIQUE (user_id, name);
    RAISE NOTICE 'Created constraint accounting_periods_user_id_name_unique';
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'Could not create unique constraint - duplicates exist. Please clean up duplicate period names for each user.';
  WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint already exists';
END $$;
