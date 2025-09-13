-- TEST MIGRATION STEP BY STEP
-- Run each section separately to identify any issues

-- ============================================
-- SECTION 1: DROP VIEWS (should work)
-- ============================================
DROP VIEW IF EXISTS finance_roi CASCADE;
DROP VIEW IF EXISTS area_finance_totals CASCADE;
DROP VIEW IF EXISTS domain_finance_totals CASCADE;
DROP VIEW IF EXISTS project_status CASCADE;
DROP VIEW IF EXISTS project_progress CASCADE;
DROP VIEW IF EXISTS business_focus CASCADE;
DROP VIEW IF EXISTS personal_focus CASCADE;
DROP VIEW IF EXISTS focus_today CASCADE;
DROP VIEW IF EXISTS daily_schedule CASCADE;
DROP VIEW IF EXISTS today_time_blocks CASCADE;
DROP VIEW IF EXISTS needs_time_blocking CASCADE;
DROP VIEW IF EXISTS needs_scheduling CASCADE;
DROP VIEW IF EXISTS area_overview CASCADE;
DROP VIEW IF EXISTS domain_overview CASCADE;
DROP VIEW IF EXISTS venture_overview CASCADE;
DROP VIEW IF EXISTS week_ahead CASCADE;
DROP VIEW IF EXISTS time_block_utilization CASCADE;
DROP VIEW IF EXISTS weekly_kpis CASCADE;
DROP VIEW IF EXISTS system_inventory CASCADE;

-- ============================================
-- SECTION 2: DROP FUNCTIONS (should work)
-- ============================================
DO $$ 
DECLARE
    _sql text;
BEGIN
    -- Drop all versions of create_task_from_capture_with_area
    FOR _sql IN 
        SELECT 'DROP FUNCTION IF EXISTS ' || oid::regprocedure || ' CASCADE;'
        FROM pg_proc 
        WHERE proname = 'create_task_from_capture_with_area'
    LOOP
        EXECUTE _sql;
    END LOOP;
    
    -- Drop all versions of create_or_update_task
    FOR _sql IN 
        SELECT 'DROP FUNCTION IF EXISTS ' || oid::regprocedure || ' CASCADE;'
        FROM pg_proc 
        WHERE proname = 'create_or_update_task'
    LOOP
        EXECUTE _sql;
    END LOOP;
    
    -- Drop all versions of create_task_from_capture
    FOR _sql IN 
        SELECT 'DROP FUNCTION IF EXISTS ' || oid::regprocedure || ' CASCADE;'
        FROM pg_proc 
        WHERE proname = 'create_task_from_capture'
    LOOP
        EXECUTE _sql;
    END LOOP;
END $$;

-- ============================================
-- SECTION 3: ADD COLUMNS (test this carefully)
-- ============================================

-- Check and rename name to title in tasks if needed
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'tasks' AND column_name = 'name') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'tasks' AND column_name = 'title') THEN
        ALTER TABLE tasks RENAME COLUMN name TO title;
    END IF;
END $$;

-- Add columns to tasks
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS notion_page_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES domains(id),
ADD COLUMN IF NOT EXISTS venture_id UUID REFERENCES ventures(id),
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id),
ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id),
ADD COLUMN IF NOT EXISTS priority TEXT,
ADD COLUMN IF NOT EXISTS status TEXT,
ADD COLUMN IF NOT EXISTS focus_date DATE,
ADD COLUMN IF NOT EXISTS focus_slot TEXT,
ADD COLUMN IF NOT EXISTS due_date DATE,
ADD COLUMN IF NOT EXISTS assignee TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add columns to projects
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES domains(id),
ADD COLUMN IF NOT EXISTS venture_id UUID REFERENCES ventures(id),
ADD COLUMN IF NOT EXISTS status TEXT,
ADD COLUMN IF NOT EXISTS priority TEXT,
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS target_date DATE,
ADD COLUMN IF NOT EXISTS budget NUMERIC,
ADD COLUMN IF NOT EXISTS budget_spent NUMERIC,
ADD COLUMN IF NOT EXISTS revenue_generated NUMERIC,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Handle area column in projects
DO $$ 
BEGIN
    -- If area column exists and is NOT NULL, make it nullable first
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'projects' 
               AND column_name = 'area'
               AND is_nullable = 'NO') THEN
        ALTER TABLE projects ALTER COLUMN area DROP NOT NULL;
    END IF;
    
    -- If area column doesn't exist, add it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'projects' AND column_name = 'area') THEN
        ALTER TABLE projects ADD COLUMN area TEXT;
    END IF;
END $$;

-- Add columns to milestones
ALTER TABLE milestones
ADD COLUMN IF NOT EXISTS status TEXT,
ADD COLUMN IF NOT EXISTS priority TEXT,
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS target_date DATE,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- SECTION 4: TEST A SIMPLE VIEW FIRST
-- ============================================

-- Test with a very simple view first
CREATE OR REPLACE VIEW test_domains AS
SELECT * FROM domains;

-- If that works, test a join
CREATE OR REPLACE VIEW test_ventures AS
SELECT 
    v.*,
    d.name as domain_name
FROM ventures v
JOIN domains d ON v.primary_domain_id = d.id;

-- Clean up test views
DROP VIEW IF EXISTS test_domains;
DROP VIEW IF EXISTS test_ventures;

-- ============================================
-- SECTION 5: CREATE RPC FUNCTION
-- ============================================
-- Only create this after columns are added successfully

CREATE OR REPLACE FUNCTION create_or_update_task(
    p_title TEXT,
    p_venture_name TEXT,
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
    -- Find venture by name or slug
    SELECT v.id, v.primary_domain_id 
    INTO v_venture_id, v_domain_id
    FROM ventures v
    WHERE LOWER(v.name) = LOWER(p_venture_name) 
       OR LOWER(v.slug) = LOWER(p_venture_name)
    LIMIT 1;
    
    IF v_venture_id IS NULL THEN
        RAISE EXCEPTION 'Venture not found: %', p_venture_name;
    END IF;
    
    -- Handle project if provided
    IF p_project_name IS NOT NULL AND p_project_name != '' THEN
        SELECT id INTO v_project_id
        FROM projects
        WHERE venture_id = v_venture_id 
        AND LOWER(name) = LOWER(p_project_name)
        LIMIT 1;
        
        IF v_project_id IS NULL THEN
            INSERT INTO projects (
                name, venture_id, domain_id, status, priority,
                created_at, updated_at
            )
            VALUES (
                p_project_name, v_venture_id, v_domain_id,
                'Active', COALESCE(p_priority, 'P2'),
                NOW(), NOW()
            )
            RETURNING id INTO v_project_id;
        END IF;
    END IF;
    
    -- Handle milestone if provided
    IF v_project_id IS NOT NULL AND p_milestone_name IS NOT NULL AND p_milestone_name != '' THEN
        SELECT id INTO v_milestone_id
        FROM milestones
        WHERE project_id = v_project_id 
        AND LOWER(name) = LOWER(p_milestone_name)
        LIMIT 1;
        
        IF v_milestone_id IS NULL THEN
            INSERT INTO milestones (
                name, project_id, status, priority,
                created_at, updated_at
            )
            VALUES (
                p_milestone_name, v_project_id,
                'Active', COALESCE(p_priority, 'P2'),
                NOW(), NOW()
            )
            RETURNING id INTO v_milestone_id;
        END IF;
    END IF;
    
    -- Check if task exists
    IF p_notion_page_id IS NOT NULL THEN
        SELECT id INTO v_task_id
        FROM tasks
        WHERE notion_page_id = p_notion_page_id
        LIMIT 1;
    END IF;
    
    -- Update or insert task
    IF v_task_id IS NOT NULL THEN
        UPDATE tasks
        SET 
            title = p_title,
            venture_id = v_venture_id,
            domain_id = v_domain_id,
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
        INSERT INTO tasks (
            title, venture_id, domain_id, project_id, milestone_id,
            priority, status, due_date, assignee, notion_page_id,
            focus_date, focus_slot, created_at, updated_at
        )
        VALUES (
            p_title, v_venture_id, v_domain_id, v_project_id, v_milestone_id,
            p_priority, p_status, p_due_date, p_assignee, p_notion_page_id,
            p_focus_date, p_focus_slot, NOW(), NOW()
        )
        RETURNING id INTO v_task_id;
    END IF;
    
    RETURN json_build_object(
        'task_id', v_task_id,
        'venture_id', v_venture_id,
        'domain_id', v_domain_id,
        'project_id', v_project_id,
        'milestone_id', v_milestone_id,
        'created', (v_task_id IS NOT NULL)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION create_or_update_task TO anon, authenticated;

-- ============================================
-- SECTION 6: CREATE VIEWS ONE BY ONE
-- ============================================

-- Test each view individually to find any issues

-- 1. Domain Overview (basic aggregation)
CREATE OR REPLACE VIEW domain_overview AS
SELECT 
    d.id as domain_id,
    d.name as domain_name,
    d.slug as domain_slug,
    COUNT(DISTINCT v.id) as venture_count,
    d.is_active as active
FROM domains d
LEFT JOIN ventures v ON v.primary_domain_id = d.id
GROUP BY d.id, d.name, d.slug, d.is_active
ORDER BY d.name;

-- 2. Venture Overview
CREATE OR REPLACE VIEW venture_overview AS
SELECT 
    v.id as venture_id,
    v.name as venture_name,
    v.slug as venture_slug,
    d.name as domain_name,
    v.is_active as active
FROM ventures v
LEFT JOIN domains d ON v.primary_domain_id = d.id
ORDER BY d.name, v.name;

-- 3. Focus Today (test with empty tasks table)
CREATE OR REPLACE VIEW focus_today AS
SELECT 
    t.id,
    t.title,
    d.name as domain,
    v.name as venture,
    p.name as project,
    m.name as milestone,
    t.priority,
    t.status,
    t.focus_slot,
    t.due_date,
    t.assignee,
    CASE 
        WHEN d.name IN ('work', 'finance', 'learning') THEN 'business'
        ELSE 'personal'
    END as category
FROM tasks t
LEFT JOIN domains d ON t.domain_id = d.id
LEFT JOIN ventures v ON t.venture_id = v.id
LEFT JOIN projects p ON t.project_id = p.id
LEFT JOIN milestones m ON t.milestone_id = m.id
WHERE t.focus_date = CURRENT_DATE
AND COALESCE(t.status, '') != 'Done'
ORDER BY t.priority, t.focus_slot;

-- If all tests pass, continue with other views...
