-- Complete schema fix for projects table and RPC functions
-- This script:
-- 1. Drops conflicting RPC functions
-- 2. Adds domain_id to projects table
-- 3. Removes the legacy area column
-- 4. Adds missing notion_page_id to tasks
-- 5. Creates the correct RPC function

-- Step 1: Drop all existing versions of the RPC function to avoid conflicts
DROP FUNCTION IF EXISTS create_or_update_task(
    text, text, text, text, text, text, date, text, text, date, text
);

DROP FUNCTION IF EXISTS create_or_update_task(
    text, text, text, text, text, timestamp with time zone, text, text, text, timestamp with time zone, text, text
);

-- Step 2: Add notion_page_id to tasks table if it doesn't exist
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS notion_page_id TEXT UNIQUE;

-- Step 3: Add domain_id to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES domains(id);

-- Step 4: Populate domain_id based on venture relationships
-- This links each project to its domain via the venture
UPDATE projects p
SET domain_id = v.primary_domain_id
FROM ventures v
WHERE p.venture_id = v.id
AND p.domain_id IS NULL;

-- Step 5: Make domain_id NOT NULL after populating
ALTER TABLE projects 
ALTER COLUMN domain_id SET NOT NULL;

-- Step 6: Drop the legacy area column from projects
ALTER TABLE projects 
DROP COLUMN IF EXISTS area;

-- Step 7: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_domain_id ON projects(domain_id);
CREATE INDEX IF NOT EXISTS idx_projects_venture_id ON projects(venture_id);
CREATE INDEX IF NOT EXISTS idx_tasks_notion_page_id ON tasks(notion_page_id);

-- Step 8: Create the correct RPC function
CREATE OR REPLACE FUNCTION create_or_update_task(
    p_title TEXT,
    p_area TEXT,  -- This will be the venture name
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
    v_domain_id UUID;
    v_project_id UUID;
    v_milestone_id UUID;
    v_task_id UUID;
    v_result JSON;
BEGIN
    -- Find venture by name (case-insensitive)
    SELECT id, primary_domain_id INTO v_venture_id, v_domain_id
    FROM ventures
    WHERE LOWER(name) = LOWER(p_area) OR LOWER(slug) = LOWER(p_area)
    LIMIT 1;
    
    -- If not found as venture, try to find as domain and use first venture
    IF v_venture_id IS NULL THEN
        SELECT v.id, d.id INTO v_venture_id, v_domain_id
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
                domain_id,  -- Now using domain_id instead of area
                status,
                priority,
                created_at,
                updated_at
            )
            VALUES (
                p_project_name, 
                v_venture_id,
                v_domain_id,  -- Use the domain_id from venture
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

-- Step 9: Grant execute permission
GRANT EXECUTE ON FUNCTION create_or_update_task TO anon, authenticated;

-- Step 10: Verify the changes
DO $$
BEGIN
    RAISE NOTICE 'Schema migration complete!';
    RAISE NOTICE 'Projects table now has domain_id instead of area';
    RAISE NOTICE 'Tasks table now has notion_page_id column';
    RAISE NOTICE 'RPC function conflicts resolved';
END $$;
