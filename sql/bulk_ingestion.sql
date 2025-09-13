-- Bulk ingestion staging table and processing function
-- Allows CSV/JSONL loads into bulk_tasks, then processes rows into projects/milestones/tasks
-- using the same rules as the bridge and the create_or_update_task RPC.

BEGIN;

-- 1) Staging table for bulk tasks
CREATE TABLE IF NOT EXISTS bulk_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  venture TEXT NOT NULL,              -- venture slug or name
  project TEXT NULL,
  milestone TEXT NULL,
  status TEXT NOT NULL,               -- expected canonical: 'To Do','In Progress','Done','On Hold'
  priority TEXT NOT NULL,             -- expected canonical: 'P0','P1','P2','P3'
  due_date DATE NULL,
  focus_date DATE NULL,
  focus_slot TEXT NULL,               -- must match focus_slots(slot) after normalization
  assignee TEXT NULL,
  notion_page_id TEXT NULL,

  -- processing metadata
  created_task_id UUID NULL,
  processed_at TIMESTAMPTZ NULL,
  attempts INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_tasks_processed_at ON bulk_tasks(processed_at);
CREATE INDEX IF NOT EXISTS idx_bulk_tasks_created_at ON bulk_tasks(created_at);

-- 2) Processing function leveraging the existing create_or_update_task RPC
CREATE OR REPLACE FUNCTION process_bulk_tasks(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  bulk_id UUID,
  task_id UUID,
  result TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  v_status TEXT;
  v_priority TEXT;
  v_focus_slot TEXT;
  v_json JSON;
  v_task_id UUID;
BEGIN
  FOR rec IN
    SELECT *
    FROM bulk_tasks
    WHERE processed_at IS NULL
    ORDER BY created_at
    LIMIT p_limit
  LOOP
    BEGIN
      -- Normalize status to canonical non-emoji
      IF rec.status IS NULL THEN
        v_status := 'To Do';
      ELSE
        v_status := LOWER(rec.status);
        IF v_status IN ('to do','todo','to-do','📝 to do') THEN
          v_status := 'To Do';
        ELSIF v_status LIKE 'in progress%%' OR v_status = 'in_progress' OR rec.status LIKE '🔄%%' THEN
          v_status := 'In Progress';
        ELSIF v_status IN ('done','complete','completed') OR rec.status LIKE '✅%%' THEN
          v_status := 'Done';
        ELSIF v_status IN ('on hold','on_hold') OR rec.status LIKE '⏸️%%' THEN
          v_status := 'On Hold';
        ELSE
          v_status := 'To Do';
        END IF;
      END IF;

      -- Normalize priority to P0..P3
      IF rec.priority IS NULL THEN
        v_priority := 'P2';
      ELSE
        v_priority := LOWER(rec.priority);
        IF v_priority LIKE '%%p0%%' OR v_priority LIKE '%%urgent%%' OR rec.priority = '🔴 P0' THEN
          v_priority := 'P0';
        ELSIF v_priority LIKE '%%p1%%' OR v_priority LIKE '%%high%%' OR rec.priority IN ('🟠 P1','🔴 P1') THEN
          v_priority := 'P1';
        ELSIF v_priority LIKE '%%p2%%' OR v_priority LIKE '%%medium%%' OR rec.priority = '🟡 P2' THEN
          v_priority := 'P2';
        ELSIF v_priority LIKE '%%p3%%' OR v_priority LIKE '%%low%%' OR rec.priority = '🟢 P3' THEN
          v_priority := 'P3';
        ELSE
          v_priority := 'P2';
        END IF;
      END IF;

      -- Normalize focus_slot via focus_slots list (case-insensitive)
      v_focus_slot := NULL;
      IF rec.focus_slot IS NOT NULL AND rec.focus_slot <> '' THEN
        -- exact CI match
        SELECT slot INTO v_focus_slot
        FROM focus_slots
        WHERE LOWER(slot) = LOWER(rec.focus_slot)
        LIMIT 1;

        -- partial CI match if exact not found
        IF v_focus_slot IS NULL THEN
          SELECT slot INTO v_focus_slot
          FROM focus_slots
          WHERE LOWER(slot) LIKE LOWER('%%' || rec.focus_slot || '%%')
             OR LOWER(rec.focus_slot) LIKE LOWER('%%' || slot || '%%')
          LIMIT 1;
        END IF;
      END IF;

      -- Call the existing RPC to create or update the task
      SELECT create_or_update_task(
        rec.title,
        rec.venture,
        rec.project,
        rec.milestone,
        v_priority,
        v_status,
        rec.due_date,
        rec.assignee,
        rec.notion_page_id,
        rec.focus_date,
        v_focus_slot
      ) INTO v_json;

      -- Extract task_id from RPC result JSON
      v_task_id := NULL;
      BEGIN
        v_task_id := (v_json->>'task_id')::uuid;
      EXCEPTION WHEN others THEN
        v_task_id := NULL;
      END;

      -- Mark row processed
      UPDATE bulk_tasks
      SET created_task_id = v_task_id,
          processed_at = NOW(),
          attempts = attempts + 1,
          error_message = NULL
      WHERE id = rec.id;

      bulk_id := rec.id;
      task_id := v_task_id;
      result := 'ok';
      RETURN NEXT;

    EXCEPTION WHEN others THEN
      -- Record error on the row and proceed
      UPDATE bulk_tasks
      SET attempts = attempts + 1,
          error_message = SQLERRM
      WHERE id = rec.id;

      bulk_id := rec.id;
      task_id := NULL;
      result := 'error: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$$;

COMMIT;

