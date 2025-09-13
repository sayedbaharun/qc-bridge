-- Safe schema migration that handles view dependencies
-- This script updates the schema without breaking existing views

-- Step 1: Drop conflicting RPC functions
DROP FUNCTION IF EXISTS create_or_update_task(
    text, text, text, text, text, text, date, text, text, date, text
);

DROP FUNCTION IF EXISTS create_or_update_task(
    text, text, text, text, text, timestamp with time zone, text, text, text, timestamp with time zone, text, text
);

-- Step 2: Add missing columns first
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS notion_page_id TEXT UNIQUE;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES domains(id);

-- Step 3: Populate domain_id based on venture relationships
UPDATE projects p
SET domain_id = v.primary_domain_id
FROM ventures v
WHERE p.venture_id = v.id
AND p.domain_id IS NULL;

-- Step 4: For any projects still without domain_id, try to infer from area column
UPDATE projects p
SET domain_id = d.id
FROM domains d
WHERE LOWER(p.area) = LOWER(d.name)
AND p.domain_id IS NULL;

-- Step 5: If still null, set to a default domain (work)
UPDATE projects p
SET domain_id = (SELECT id FROM domains WHERE name = 'work' LIMIT 1)
WHERE p.domain_id IS NULL;

-- Step 6: Make domain_id NOT NULL
ALTER TABLE projects 
ALTER COLUMN domain_id SET NOT NULL;

-- Step 7: Update the area column to match the domain name for compatibility with views
-- This keeps the views working while we transition
UPDATE projects p
SET area = d.name
FROM domains d
WHERE p.domain_id = d.id;

-- Step 8: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_domain_id ON projects(domain_id);
CREATE INDEX IF NOT EXISTS idx_projects_venture_id ON projects(venture_id);
CREATE INDEX IF NOT EXISTS idx_tasks_notion_page_id ON tasks(notion_page_id);

-- Step 9: Create the correct RPC function
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
    v_domain_name TEXT;
    v_project_id UUID;
    v_milestone_id UUID;
    v_task_id UUID;
    v_result JSON;
BEGIN
    -- Find venture by name (case-insensitive)
    SELECT v.id, v.primary_domain_id, d.name 
    INTO v_venture_id, v_domain_id, v_domain_name
    FROM ventures v
    JOIN domains d ON v.primary_domain_id = d.id
    WHERE LOWER(v.name) = LOWER(p_area) OR LOWER(v.slug) = LOWER(p_area)
    LIMIT 1;
    
    -- If not found as venture, try to find as domain and use first venture
    IF v_venture_id IS NULL THEN
        SELECT v.id, d.id, d.name 
        INTO v_venture_id, v_domain_id, v_domain_name
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
                domain_id,
                area,  -- Keep area for view compatibility, set to domain name
                status,
                priority,
                created_at,
                updated_at
            )
            VALUES (
                p_project_name, 
                v_venture_id,
                v_domain_id,
                v_domain_name,  -- Use domain name for area
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

-- Step 10: Grant execute permission
GRANT EXECUTE ON FUNCTION create_or_update_task TO anon, authenticated;

-- Step 11: Create a view to help transition from area to domain
CREATE OR REPLACE VIEW project_domains AS
SELECT 
    p.*,
    d.name as domain_name,
    v.name as venture_name
FROM projects p
JOIN domains d ON p.domain_id = d.id
JOIN ventures v ON p.venture_id = v.id;

-- Step 12: Show summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Schema migration complete!';
    RAISE NOTICE '';
    RAISE NOTICE 'Changes made:';
    RAISE NOTICE '1. Added domain_id to projects table';
    RAISE NOTICE '2. Kept area column for view compatibility';
    RAISE NOTICE '3. Area column now synced with domain name';
    RAISE NOTICE '4. Added notion_page_id to tasks table';
    RAISE NOTICE '5. Fixed RPC function conflicts';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Test the sync to ensure it works';
    RAISE NOTICE '2. Update views to use domain_id instead of area';
    RAISE NOTICE '3. Then drop the area column';
END $$;
