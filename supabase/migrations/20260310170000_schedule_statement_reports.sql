CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION trigger_send_monthly_statements()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_key text;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_key := current_setting('app.settings.service_role_key', true);

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-monthly-statements',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION trigger_send_yearly_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_key text;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_key := current_setting('app.settings.service_role_key', true);

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-yearly-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-monthly-statements-job') THEN
    PERFORM cron.schedule(
      'send-monthly-statements-job',
      '0 0 1 * *',
      $$SELECT trigger_send_monthly_statements();$$
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-yearly-summary-job') THEN
    PERFORM cron.schedule(
      'send-yearly-summary-job',
      '0 0 1 1 *',
      $$SELECT trigger_send_yearly_summary();$$
    );
  END IF;
END
$$;

COMMENT ON FUNCTION trigger_send_monthly_statements IS 'Triggers the send-monthly-statements Edge Function via HTTP POST';
COMMENT ON FUNCTION trigger_send_yearly_summary IS 'Triggers the send-yearly-summary Edge Function via HTTP POST';
