-- Create data_backups table for storing database backups
CREATE TABLE IF NOT EXISTS data_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  backup_type TEXT NOT NULL DEFAULT 'manual', -- 'manual' or 'automatic'
  backup_name TEXT NOT NULL,
  backup_data JSONB NOT NULL, -- Complete backup payload
  backup_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'completed', -- 'pending', 'completed', 'failed'
  retention_days INTEGER NOT NULL DEFAULT 30,
  file_size BIGINT NOT NULL DEFAULT 0, -- Size in bytes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_data_backups_user_id ON data_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_data_backups_backup_date ON data_backups(backup_date DESC);
CREATE INDEX IF NOT EXISTS idx_data_backups_type ON data_backups(backup_type);
CREATE INDEX IF NOT EXISTS idx_data_backups_status ON data_backups(status);

-- Add RLS policies
ALTER TABLE data_backups ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own backups
CREATE POLICY data_backups_select_policy ON data_backups
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own backups
CREATE POLICY data_backups_insert_policy ON data_backups
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own backups
CREATE POLICY data_backups_delete_policy ON data_backups
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE data_backups IS 'Stores automatic and manual database backups for each user';

-- Create function to auto-delete old backups based on retention period
CREATE OR REPLACE FUNCTION delete_expired_backups()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM data_backups
  WHERE backup_date < NOW() - (retention_days || ' days')::INTERVAL;
END;
$$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_data_backups_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create trigger for updated_at
CREATE TRIGGER update_data_backups_updated_at_trigger
  BEFORE UPDATE ON data_backups
  FOR EACH ROW
  EXECUTE FUNCTION update_data_backups_updated_at();
