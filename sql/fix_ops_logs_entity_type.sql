-- Ensure ops_logs has entity_type column and index
ALTER TABLE ops_logs 
ADD COLUMN IF NOT EXISTS entity_type TEXT;

CREATE INDEX IF NOT EXISTS idx_ops_logs_entity_type 
ON ops_logs(entity_type);

-- Verify column exists (optional)
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'ops_logs' AND column_name = 'entity_type';
