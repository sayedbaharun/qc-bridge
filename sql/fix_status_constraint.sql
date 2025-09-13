-- Check and fix the projects_status_check constraint

-- First, see what the current constraint is
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'projects_status_check';

-- Drop the old constraint if it exists
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

-- Add a new constraint that accepts both emoji and non-emoji versions
ALTER TABLE projects ADD CONSTRAINT projects_status_check 
CHECK (status IN (
    'Active', '🟡 Active',
    'Complete', '✅ Complete', 
    'On Hold', '⏸️ On Hold',
    'Cancelled', '❌ Cancelled',
    'Planning', '📋 Planning',
    'In Progress', '🔄 In Progress'
));

-- Verify it worked
SELECT 'Constraint updated successfully!' as status;
