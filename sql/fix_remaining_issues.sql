-- ===========================================================================
-- Fix Remaining Database Issues
-- This script addresses all remaining issues found during sync testing
-- ===========================================================================

-- 1. Add missing priority column to milestones table
-- --------------------------------------------------
ALTER TABLE milestones 
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'P2';

-- Add a check constraint to ensure valid priority values (both emoji and non-emoji versions)
ALTER TABLE milestones
DROP CONSTRAINT IF EXISTS milestones_priority_check;

ALTER TABLE milestones
ADD CONSTRAINT milestones_priority_check 
CHECK (priority IN ('P0', 'P1', 'P2', 'P3', '🔴 P0', '🟠 P1', '🟡 P2', '🟢 P3'));

-- Update any existing milestones to have a default priority
UPDATE milestones
SET priority = 'P2'
WHERE priority IS NULL;

-- 2. Add missing entity_id column to ops_logs table
-- -------------------------------------------------
ALTER TABLE ops_logs 
ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_ops_logs_entity_id 
ON ops_logs(entity_id);

-- 3. Verify all changes
-- --------------------
DO $$
DECLARE
    v_milestones_priority_exists BOOLEAN;
    v_ops_logs_entity_id_exists BOOLEAN;
BEGIN
    -- Check if milestones.priority exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'milestones' 
        AND column_name = 'priority'
    ) INTO v_milestones_priority_exists;
    
    -- Check if ops_logs.entity_id exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ops_logs' 
        AND column_name = 'entity_id'
    ) INTO v_ops_logs_entity_id_exists;
    
    -- Report results
    RAISE NOTICE 'Verification Results:';
    RAISE NOTICE '  - milestones.priority column exists: %', v_milestones_priority_exists;
    RAISE NOTICE '  - ops_logs.entity_id column exists: %', v_ops_logs_entity_id_exists;
    
    IF v_milestones_priority_exists AND v_ops_logs_entity_id_exists THEN
        RAISE NOTICE 'All fixes applied successfully!';
    ELSE
        RAISE WARNING 'Some fixes may not have been applied correctly.';
    END IF;
END $$;
