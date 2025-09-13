-- Accept both emoji and non-emoji focus_slot values; allow NULL
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_focus_slot_check'
  ) THEN
    EXECUTE 'ALTER TABLE tasks DROP CONSTRAINT tasks_focus_slot_check';
  END IF;
END $$;

ALTER TABLE tasks
ADD CONSTRAINT tasks_focus_slot_check
CHECK (
  focus_slot IS NULL OR focus_slot IN (
    '🌅 Morning Routine', 'Morning Routine',
    '🎯 Deep Work Block 1', 'Deep Work Block 1',
    '📋 Admin Block 1', 'Admin Block 1',
    '🔋 Recharge & Rest', 'Recharge & Rest',
    '🎯 Deep Work Block 2', 'Deep Work Block 2',
    '📋 Admin Block 2', 'Admin Block 2',
    '🌙 Shutdown Routine', 'Shutdown Routine'
  )
);

SELECT 'tasks_focus_slot_check updated' AS info;
