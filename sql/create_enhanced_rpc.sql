-- Enhanced create_or_update_task function for domains/ventures model
CREATE OR REPLACE FUNCTION create_or_update_task(
  p_title TEXT,
  p_area TEXT,  -- This will be a domain slug or venture slug
  p_project_name TEXT DEFAULT NULL,
  p_milestone_name TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT NULL,
  p_due_date TIMESTAMPTZ DEFAULT NULL,
  p_assignee TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_focus_slot TEXT DEFAULT NULL,
  p_focus_date TIMESTAMPTZ DEFAULT NULL,
  p_notion_page_id TEXT DEFAULT NULL,
  p_external_hash TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_id UUID;
  v_milestone_id UUID;
  v_task_id UUID;
  v_domain_id UUID;
  v_venture_id UUID;
  v_created BOOLEAN := FALSE;
  v_updated BOOLEAN := FALSE;
  v_result JSON;
BEGIN
  -- Resolve area to domain or venture
  -- Area could be either a venture slug or a domain slug
  -- First try to find it as a venture (more specific)
  SELECT id, primary_domain_id INTO v_venture_id, v_domain_id
  FROM ventures 
  WHERE slug = LOWER(p_area);
  
  -- If not found as venture, try as domain
  IF v_venture_id IS NULL THEN
    SELECT id INTO v_domain_id
    FROM domains
    WHERE slug = LOWER(p_area);
    
    -- If area is a domain but project name matches a venture, use that venture
    IF v_domain_id IS NOT NULL AND p_project_name IS NOT NULL THEN
      SELECT id INTO v_venture_id
      FROM ventures
      WHERE primary_domain_id = v_domain_id
      AND LOWER(name) = LOWER(p_project_name)
      LIMIT 1;
    END IF;
  END IF;
  
  -- If still not found, raise exception
  IF v_domain_id IS NULL THEN
    RAISE EXCEPTION 'Area "%" could not be resolved to a domain or venture', p_area;
  END IF;
  
  -- Handle project creation/lookup
  IF p_project_name IS NOT NULL THEN
    -- Look for existing project first
    SELECT id INTO v_project_id
    FROM projects 
    WHERE LOWER(name) = LOWER(p_project_name) 
    AND (
      (v_venture_id IS NOT NULL AND venture_id = v_venture_id) OR
      (v_venture_id IS NULL AND venture_id IS NULL)
    );
    
    -- Create project if not found
    IF v_project_id IS NULL THEN
      INSERT INTO projects (name, venture_id, description, created_at)
      VALUES (
        p_project_name, 
        v_venture_id,
        CASE 
          WHEN v_venture_id IS NOT NULL THEN 'Project under venture'
          ELSE 'Project under domain'
        END,
        now()
      )
      RETURNING id INTO v_project_id;
    END IF;
  END IF;
  
  -- Handle milestone creation/lookup
  IF p_milestone_name IS NOT NULL AND v_project_id IS NOT NULL THEN
    SELECT id INTO v_milestone_id
    FROM milestones 
    WHERE LOWER(name) = LOWER(p_milestone_name) 
    AND project_id = v_project_id;
    
    IF v_milestone_id IS NULL THEN
      INSERT INTO milestones (name, project_id, created_at)
      VALUES (p_milestone_name, v_project_id, now())
      RETURNING id INTO v_milestone_id;
    END IF;
  END IF;
  
  -- Check for existing task by external hash or notion page id
  SELECT id INTO v_task_id
  FROM tasks 
  WHERE (p_external_hash IS NOT NULL AND external_hash = p_external_hash)
     OR (p_notion_page_id IS NOT NULL AND notion_page_id = p_notion_page_id);
  
  -- Create or update task
  IF v_task_id IS NULL THEN
    -- Create new task
    INSERT INTO tasks (
      name, project_id, milestone_id, priority, due_date, 
      assignee_email, status, focus_slot, focus_date, 
      notion_page_id, external_hash, created_at
    )
    VALUES (
      p_title, v_project_id, v_milestone_id, p_priority, p_due_date,
      p_assignee, p_status, p_focus_slot, p_focus_date,
      p_notion_page_id, p_external_hash, now()
    )
    RETURNING id INTO v_task_id;
    
    v_created := TRUE;
  ELSE
    -- Update existing task
    UPDATE tasks SET
      name = p_title,
      project_id = COALESCE(v_project_id, project_id),
      milestone_id = COALESCE(v_milestone_id, milestone_id),
      priority = COALESCE(p_priority, priority),
      due_date = COALESCE(p_due_date, due_date),
      assignee_email = COALESCE(p_assignee, assignee_email),
      status = COALESCE(p_status, status),
      focus_slot = COALESCE(p_focus_slot, focus_slot),
      focus_date = COALESCE(p_focus_date, focus_date),
      external_hash = COALESCE(p_external_hash, external_hash),
      updated_at = now()
    WHERE id = v_task_id;
    
    v_updated := TRUE;
  END IF;
  
  -- Update integrations_notion record
  IF p_notion_page_id IS NOT NULL THEN
    INSERT INTO integrations_notion (notion_page_id, task_id, external_hash, last_seen_at)
    VALUES (p_notion_page_id, v_task_id, p_external_hash, now())
    ON CONFLICT (notion_page_id) 
    DO UPDATE SET 
      task_id = EXCLUDED.task_id,
      external_hash = EXCLUDED.external_hash,
      last_seen_at = EXCLUDED.last_seen_at;
  END IF;
  
  -- Build result
  SELECT json_build_object(
    'task_id', v_task_id,
    'created', v_created,
    'updated', v_updated,
    'domain_id', v_domain_id,
    'venture_id', v_venture_id
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;
