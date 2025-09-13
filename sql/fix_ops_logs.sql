-- Fix: Add missing entity_id column to ops_logs table
-- This column is referenced in the bridge code but doesn't exist in the table

-- Add entity_id column to ops_logs table
ALTER TABLE ops_logs 
ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_ops_logs_entity_id 
ON ops_logs(entity_id);

-- Verify the change
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'ops_logs'
AND column_name = 'entity_id';
