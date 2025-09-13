-- Update tasks_status_check to accept emoji and non-emoji variants
-- Safe to run multiple times

DO $$ BEGIN
  -- Drop if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_status_check'
  ) THEN
    EXECUTE 'ALTER TABLE tasks DROP CONSTRAINT tasks_status_check';
  END IF;
END $$;

-- Add relaxed constraint
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check 
CHECK (
  status IS NULL OR status IN (
    'To Do', '📝 To Do',
    'In Progress', '🔄 In Progress',
    'Done', '✅ Done', 'Completed', 'completed',
    'On Hold', '⏸️ On Hold'
  )
);

-- Verify (optional, harmless)
SELECT 'tasks_status_check updated' AS info;
