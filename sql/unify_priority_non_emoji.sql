-- Unify priority constraints to non-emoji forms across tasks, projects, milestones
-- 1) Tasks
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('P0','P1','P2','P3'));

-- 2) Projects (if projects.priority exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='projects' AND column_name='priority'
  ) THEN
    EXECUTE 'ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_priority_check';
    EXECUTE 'ALTER TABLE projects ADD CONSTRAINT projects_priority_check CHECK (priority IN (''P0'',''P1'',''P2'',''P3''))';
  END IF;
END $$;

-- 3) Milestones
ALTER TABLE milestones DROP CONSTRAINT IF EXISTS milestones_priority_check;
ALTER TABLE milestones
  ADD CONSTRAINT milestones_priority_check CHECK (priority IN ('P0','P1','P2','P3'));

-- Optional: normalize existing values to non-emoji
UPDATE tasks SET priority = CASE
  WHEN priority ILIKE '%p0%' OR priority ILIKE '%urgent%' OR priority LIKE '🔴 P0' THEN 'P0'
  WHEN priority ILIKE '%p1%' OR priority ILIKE '%high%'   OR priority LIKE '🟠 P1' OR priority LIKE '🔴 P1' THEN 'P1'
  WHEN priority ILIKE '%p2%' OR priority ILIKE '%medium%' OR priority LIKE '🟡 P2' THEN 'P2'
  WHEN priority ILIKE '%p3%' OR priority ILIKE '%low%'    OR priority LIKE '🟢 P3' THEN 'P3'
  ELSE 'P2'
END
WHERE priority IS NOT NULL;

UPDATE milestones SET priority = CASE
  WHEN priority ILIKE '%p0%' OR priority ILIKE '%urgent%' OR priority LIKE '🔴 P0' THEN 'P0'
  WHEN priority ILIKE '%p1%' OR priority ILIKE '%high%'   OR priority LIKE '🟠 P1' OR priority LIKE '🔴 P1' THEN 'P1'
  WHEN priority ILIKE '%p2%' OR priority ILIKE '%medium%' OR priority LIKE '🟡 P2' THEN 'P2'
  WHEN priority ILIKE '%p3%' OR priority ILIKE '%low%'    OR priority LIKE '🟢 P3' THEN 'P3'
  ELSE 'P2'
END
WHERE priority IS NOT NULL;

UPDATE projects SET priority = CASE
  WHEN priority ILIKE '%p0%' OR priority ILIKE '%urgent%' OR priority LIKE '🔴 P0' THEN 'P0'
  WHEN priority ILIKE '%p1%' OR priority ILIKE '%high%'   OR priority LIKE '🟠 P1' OR priority LIKE '🔴 P1' THEN 'P1'
  WHEN priority ILIKE '%p2%' OR priority ILIKE '%medium%' OR priority LIKE '🟡 P2' THEN 'P2'
  WHEN priority ILIKE '%p3%' OR priority ILIKE '%low%'    OR priority LIKE '🟢 P3' THEN 'P3'
  ELSE 'P2'
END
WHERE priority IS NOT NULL;
