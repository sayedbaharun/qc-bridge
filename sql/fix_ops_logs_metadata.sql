-- Ensure ops_logs has metadata column used by metrics-collector
ALTER TABLE ops_logs 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Optional: index for created_at if heavy writes/reads
CREATE INDEX IF NOT EXISTS idx_ops_logs_created_at 
ON ops_logs(created_at);

-- Verify (optional)
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'ops_logs' AND column_name = 'metadata';
