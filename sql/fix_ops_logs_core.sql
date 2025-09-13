-- Ensure ops_logs has required core columns used by metrics-collector
ALTER TABLE ops_logs 
ADD COLUMN IF NOT EXISTS operation TEXT,
ADD COLUMN IF NOT EXISTS created_by TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Helpful index for time-ordered queries
CREATE INDEX IF NOT EXISTS idx_ops_logs_created_at 
ON ops_logs(created_at);

-- Verify (optional)
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'ops_logs' AND column_name IN ('operation','created_by','created_at')
ORDER BY column_name;
