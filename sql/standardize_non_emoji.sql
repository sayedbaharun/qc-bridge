-- Standardize tasks to non-emoji values for status, priority, and focus_slot
-- Run order: 1) sql/create_focus_slots.sql (if not already), then this file.

BEGIN;

-- 1) Normalize STATUS to non-emoji canonical values
UPDATE tasks SET status = 'To Do'
WHERE status IN ('📝 To Do','To do','to do');

UPDATE tasks SET status = 'In Progress'
WHERE status IN ('🔄 In Progress','in_progress','In progress','in progress');

UPDATE tasks SET status = 'Done'
WHERE status IN ('✅ Done','completed','Complete','complete');

UPDATE tasks SET status = 'On Hold'
WHERE status IN ('⏸️ On Hold','on_hold','On hold','on hold');

-- Default any stragglers to To Do
UPDATE tasks SET status = 'To Do'
WHERE status IS NULL OR status NOT IN ('To Do','In Progress','Done','On Hold');

-- 2) Normalize PRIORITY to P0..P3
UPDATE tasks SET priority = 'P0'
WHERE priority ILIKE '%p0%' OR priority ILIKE '%urgent%' OR priority = '🔴 P0';

UPDATE tasks SET priority = 'P1'
WHERE priority ILIKE '%p1%' OR priority ILIKE '%high%' OR priority IN ('🟠 P1','🔴 P1');

UPDATE tasks SET priority = 'P2'
WHERE priority ILIKE '%p2%' OR priority ILIKE '%medium%' OR priority = '🟡 P2';

UPDATE tasks SET priority = 'P3'
WHERE priority ILIKE '%p3%' OR priority ILIKE '%low%' OR priority = '🟢 P3';

-- Default any stragglers to P2
UPDATE tasks SET priority = 'P2'
WHERE priority IS NULL OR priority NOT IN ('P0','P1','P2','P3');

-- 3) Normalize FOCUS_SLOT to canonical non-emoji names
UPDATE tasks SET focus_slot = 'Morning Routine' WHERE focus_slot IN ('🌅 Morning Routine','Morning Routine');
UPDATE tasks SET focus_slot = 'Deep Work Block 1' WHERE focus_slot IN ('🎯 Deep Work Block 1','Deep Work Block 1');
UPDATE tasks SET focus_slot = 'Admin Block 1' WHERE focus_slot IN ('📋 Admin Block 1','Admin Block 1');
UPDATE tasks SET focus_slot = 'Recharge & Rest' WHERE focus_slot IN ('🔋 Recharge & Rest','Recharge & Rest');
UPDATE tasks SET focus_slot = 'Deep Work Block 2' WHERE focus_slot IN ('🎯 Deep Work Block 2','Deep Work Block 2');
UPDATE tasks SET focus_slot = 'Admin Block 2' WHERE focus_slot IN ('📋 Admin Block 2','Admin Block 2');
UPDATE tasks SET focus_slot = 'Shutdown Routine' WHERE focus_slot IN ('🌙 Shutdown Routine','Shutdown Routine');

-- 4) Recreate constraints for non-emoji only
-- STATUS
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_chk;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_chk
  CHECK (status IN ('To Do','In Progress','Done','On Hold')) NOT VALID;

-- PRIORITY
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_chk;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_priority_chk
  CHECK (priority IN ('P0','P1','P2','P3')) NOT VALID;

-- FOCUS SLOT: prefer FK to the canonical list in focus_slots(slot)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_focus_slot_check;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_focus_slot_fkey;

-- Ensure all non-null values exist in focus_slots
-- (If you added new slots manually in Notion, insert them into focus_slots first.)
ALTER TABLE tasks
  ADD CONSTRAINT tasks_focus_slot_fkey
  FOREIGN KEY (focus_slot) REFERENCES focus_slots(slot);

-- Validate constraints after normalization
ALTER TABLE tasks VALIDATE CONSTRAINT tasks_status_chk;
ALTER TABLE tasks VALIDATE CONSTRAINT tasks_priority_chk;
-- FK validation is immediate when added, no separate VALIDATE needed for FK

COMMIT;

