-- Fixed create_or_update_task RPC function that handles actual table structure
-- This version works with the existing schema where projects has an 'area' column

CREATE OR REPLACE FUNCTION create_or_update_task(
    p_title TEXT,
    p_area TEXT,
    p_project_name TEXT DEFAULT NULL,
    p_milestone_name TEXT DEFAULT NULL,
    p_priority TEXT DEFAULT 'P2',
    p_status TEXT DEFAULT 'To do',
    p_due_date DATE DEFAULT NULL,
    p_assignee TEXT DEFAULT NULL,
    p_notion_page_id TEXT DEFAULT NULL,
    p_focus_date DATE DEFAULT NULL,
    p_focus_slot TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_venture_id UUID;
    v_project_id UUID;
    v_milestone_id UUID;
    v_task_id UUID;
    v_result JSON;
BEGIN
    -- Find venture by name (case-insensitive)
    SELECT id INTO v_venture_id
    FROM ventures
    WHERE LOWER(name) = LOWER(p_area) OR LOWER(slug) = LOWER(p_area)
    LIMIT 1;
    
    -- If not found as venture, try to find as domain and use a default venture
    IF v_venture_id IS NULL THEN
        SELECT v.id INTO v_venture_id
        FROM ventures v
        JOIN domains d ON v.primary_domain_id = d.id
        WHERE LOWER(d.name) = LOWER(p_area)
        LIMIT 1;
    END IF;
    
    -- If still not found, raise error
    IF v_venture_id IS NULL THEN
        RAISE EXCEPTION 'Venture or domain not found: %', p_area;
    END IF;
    
    -- Handle project if provided
    IF p_project_name IS NOT NULL AND p_project_name != '' THEN
        -- Check if project exists for this venture
        SELECT id INTO v_project_id
        FROM projects
        WHERE venture_id = v_venture_id 
        AND LOWER(name) = LOWER(p_project_name)
        LIMIT 1;
        
        -- Create project if it doesn't exist
        IF v_project_id IS NULL THEN
            INSERT INTO projects (
                name, 
                venture_id, 
                area,  -- Required field in current schema
                status,
                priority,
                created_at,
                updated_at
            )
            VALUES (
                p_project_name, 
                v_venture_id,
                p_area,  -- Use the area parameter
                '🟡 Active',
                COALESCE(p_priority, '🟡 P2'),
                NOW(),
                NOW()
            )
            RETURNING id INTO v_project_id;
        END IF;
    END IF;
    
    -- Handle milestone if provided and project exists
    IF v_project_id IS NOT NULL AND p_milestone_name IS NOT NULL AND p_milestone_name != '' THEN
        -- Check if milestone exists for this project
        SELECT id INTO v_milestone_id
        FROM milestones
        WHERE project_id = v_project_id 
        AND LOWER(name) = LOWER(p_milestone_name)
        LIMIT 1;
        
        -- Create milestone if it doesn't exist
        IF v_milestone_id IS NULL THEN
            INSERT INTO milestones (
                name, 
                project_id,
                status,
                priority,
                created_at,
                updated_at
            )
            VALUES (
                p_milestone_name, 
                v_project_id,
                '🟡 Active',
                COALESCE(p_priority, '🟡 P2'),
                NOW(),
                NOW()
            )
            RETURNING id INTO v_milestone_id;
        END IF;
    END IF;
    
    -- Check if task already exists (by notion_page_id if provided)
    IF p_notion_page_id IS NOT NULL THEN
        SELECT id INTO v_task_id
        FROM tasks
        WHERE notion_page_id = p_notion_page_id
        LIMIT 1;
    END IF;
    
    -- Update or insert task
    IF v_task_id IS NOT NULL THEN
        -- Update existing task
        UPDATE tasks
        SET 
            title = p_title,
            venture_id = v_venture_id,
            project_id = v_project_id,
            milestone_id = v_milestone_id,
            priority = p_priority,
            status = p_status,
            due_date = p_due_date,
            assignee = p_assignee,
            focus_date = p_focus_date,
            focus_slot = p_focus_slot,
            updated_at = NOW()
        WHERE id = v_task_id;
    ELSE
        -- Insert new task
        INSERT INTO tasks (
            title,
            venture_id,
            project_id,
            milestone_id,
            priority,
            status,
            due_date,
            assignee,
            notion_page_id,
            focus_date,
            focus_slot,
            created_at,
            updated_at
        )
        VALUES (
            p_title,
            v_venture_id,
            v_project_id,
            v_milestone_id,
            p_priority,
            p_status,
            p_due_date,
            p_assignee,
            p_notion_page_id,
            p_focus_date,
            p_focus_slot,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_task_id;
    END IF;
    
    -- Build result JSON
    v_result := json_build_object(
        'task_id', v_task_id,
        'venture_id', v_venture_id,
        'project_id', v_project_id,
        'milestone_id', v_milestone_id,
        'created', (v_task_id IS NOT NULL AND p_notion_page_id IS NULL)
    );
    
    RETURN v_result;
END;
$$;
