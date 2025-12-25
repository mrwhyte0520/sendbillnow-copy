-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to call the automatic backups Edge Function
CREATE OR REPLACE FUNCTION trigger_automatic_backups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_key text;
BEGIN
  -- Get Supabase URL and key from environment or settings
  -- Note: Replace these with your actual values in production
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_key := current_setting('app.settings.service_role_key', true);
  
  -- Call the Edge Function
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/automatic-backups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
  
  -- Log the execution
  RAISE NOTICE 'Automatic backup job triggered at %', NOW();
END;
$$;

-- Schedule automatic backups to run daily at 2:00 AM
-- You can adjust the schedule as needed
-- Cron format: minute hour day month weekday
SELECT cron.schedule(
  'automatic-backups-daily',
  '0 2 * * *', -- Every day at 2:00 AM
  $$SELECT trigger_automatic_backups();$$
);

-- Alternative schedules (commented out by default)

-- Run every 6 hours
-- SELECT cron.schedule(
--   'automatic-backups-6h',
--   '0 */6 * * *',
--   $$SELECT trigger_automatic_backups();$$
-- );

-- Run every Monday at 3:00 AM (weekly)
-- SELECT cron.schedule(
--   'automatic-backups-weekly',
--   '0 3 * * 1',
--   $$SELECT trigger_automatic_backups();$$
-- );

-- Run on the 1st of every month at 3:00 AM (monthly)
-- SELECT cron.schedule(
--   'automatic-backups-monthly',
--   '0 3 1 * *',
--   $$SELECT trigger_automatic_backups();$$
-- );

-- View all scheduled jobs
-- SELECT * FROM cron.job;

-- Unschedule a job (if needed)
-- SELECT cron.unschedule('automatic-backups-daily');

-- View job run history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

COMMENT ON FUNCTION trigger_automatic_backups IS 'Triggers the automatic-backups Edge Function via HTTP POST';
