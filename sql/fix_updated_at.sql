-- Fix: Add missing updated_at column to projects table

-- Add updated_at column if it doesn't exist
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add updated_at column to milestones if missing
ALTER TABLE milestones
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add updated_at column to tasks if missing  
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Verify the columns were added
SELECT 'Projects table columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'projects' 
AND column_name IN ('created_at', 'updated_at');

SELECT 'Ready to sync!' as status;
