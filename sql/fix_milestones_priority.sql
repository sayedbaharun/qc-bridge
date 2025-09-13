-- Fix: Add missing priority column to milestones table
-- This column is referenced in the RPC function but doesn't exist in the table

-- Add priority column to milestones table
ALTER TABLE milestones 
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'P2';

-- Add a check constraint to ensure valid priority values (both emoji and non-emoji versions)
ALTER TABLE milestones
DROP CONSTRAINT IF EXISTS milestones_priority_check;

ALTER TABLE milestones
ADD CONSTRAINT milestones_priority_check 
CHECK (priority IN ('P0', 'P1', 'P2', 'P3', '🔴 P0', '🟠 P1', '🟡 P2', '🟢 P3'));

-- Update any existing milestones to have a default priority (though table is empty now)
UPDATE milestones
SET priority = 'P2'
WHERE priority IS NULL;

-- Verify the change
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'milestones'
AND column_name = 'priority';
