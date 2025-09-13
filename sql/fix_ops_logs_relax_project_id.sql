-- Relax ops_logs.project_id to allow nulls so bridge logging can insert without a project context
ALTER TABLE ops_logs
ALTER COLUMN project_id DROP NOT NULL;

-- Optional: if project_id is not needed at all, you can also drop it:
-- ALTER TABLE ops_logs DROP COLUMN IF EXISTS project_id;

-- Verify (optional)
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'ops_logs' AND column_name = 'project_id';
