-- COMPLETE MIGRATION TO DOMAIN/VENTURE STRUCTURE
-- This script fully transitions from area-based to domain/venture-based system
-- Since tables are empty, we can make breaking changes safely

-- ============================================
-- STEP 1: DROP ALL DEPENDENT VIEWS
-- ============================================
-- Drop views in dependency order (children first)
DROP VIEW IF EXISTS finance_roi CASCADE;
DROP VIEW IF EXISTS area_finance_totals CASCADE;
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
DROP VIEW IF EXISTS week_ahead CASCADE;
DROP VIEW IF EXISTS time_block_utilization CASCADE;
DROP VIEW IF EXISTS weekly_kpis CASCADE;
DROP VIEW IF EXISTS system_inventory CASCADE;

-- ============================================
-- STEP 2: DROP CONFLICTING RPC FUNCTIONS
-- ============================================
-- Drop all versions of create_or_update_task
DROP FUNCTION IF EXISTS create_or_update_task(
    text, text, text, text, text, text, date, text, text, date, text
) CASCADE;

DROP FUNCTION IF EXISTS create_or_update_task(
    text, text, text, text, text, timestamp with time zone, text, text, text, timestamp with time zone, text, text
) CASCADE;

-- Drop all versions of create_task_from_capture_with_area
-- First, list all functions with this name to drop them specifically
DO $$ 
DECLARE
    _sql text;
BEGIN
    FOR _sql IN 
        SELECT 'DROP FUNCTION IF EXISTS ' || oid::regprocedure || ' CASCADE;'
        FROM pg_proc 
        WHERE proname = 'create_task_from_capture_with_area'
    LOOP
        EXECUTE _sql;
    END LOOP;
END $$;

-- ============================================
-- STEP 3: MODIFY TABLE STRUCTURES
-- ============================================

-- First, rename 'name' to 'title' in tasks table if needed
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'tasks' AND column_name = 'name') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'tasks' AND column_name = 'title') THEN
        ALTER TABLE tasks RENAME COLUMN name TO title;
    END IF;
END $$;

-- Add missing columns to tasks
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS notion_page_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES domains(id),
ADD COLUMN IF NOT EXISTS venture_id UUID REFERENCES ventures(id);

-- Add domain_id to projects and remove area constraint
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES domains(id);

-- Since tables are empty, we can safely drop and recreate the area column as nullable
ALTER TABLE projects 
DROP COLUMN IF EXISTS area CASCADE;

-- Add area back as a computed/optional field for backward compatibility
ALTER TABLE projects 
ADD COLUMN area TEXT;

-- Update tasks to have domain_id (only if there are existing tasks with venture_id)
UPDATE tasks t
SET domain_id = v.primary_domain_id
FROM ventures v
WHERE t.venture_id = v.id
AND t.domain_id IS NULL;

-- ============================================
-- STEP 4: CREATE NEW RPC FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION create_or_update_task(
    p_title TEXT,
    p_venture_name TEXT,  -- Will accept venture name or slug
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
    -- Find venture by name or slug (case-insensitive)
    SELECT v.id, v.primary_domain_id 
    INTO v_venture_id, v_domain_id
    FROM ventures v
    WHERE LOWER(v.name) = LOWER(p_venture_name) 
       OR LOWER(v.slug) = LOWER(p_venture_name)
    LIMIT 1;
    
    -- If not found, raise error
    IF v_venture_id IS NULL THEN
        RAISE EXCEPTION 'Venture not found: %', p_venture_name;
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
                status,
                priority,
                created_at,
                updated_at
            )
            VALUES (
                p_project_name, 
                v_venture_id,
                v_domain_id,
                'Active',  -- Use plain text for status
                COALESCE(p_priority, 'P2'),  -- No emoji in priority
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
                'in_progress',  -- Use valid enum value
                COALESCE(p_priority, 'P2'),  -- No emoji in priority
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
        -- Insert new task
        INSERT INTO tasks (
            title,
            venture_id,
            domain_id,
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
            v_domain_id,
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
        'domain_id', v_domain_id,
        'project_id', v_project_id,
        'milestone_id', v_milestone_id,
        'created', (v_task_id IS NOT NULL)
    );
    
    RETURN v_result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_or_update_task TO anon, authenticated;

-- ============================================
-- STEP 5: RECREATE VIEWS WITH NEW STRUCTURE
-- ============================================

-- Focus Today View (tasks scheduled for today)
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
AND COALESCE(t.status, '') NOT IN ('Done', '✅ Done', 'completed')
ORDER BY 
    CASE 
        WHEN t.priority IN ('P1', '🔴 P1') THEN 1
        WHEN t.priority IN ('P2', '🟡 P2') THEN 2
        WHEN t.priority IN ('P3', '🟢 P3') THEN 3
        ELSE 4
    END,
    t.focus_slot;

-- Business Focus View
CREATE OR REPLACE VIEW business_focus AS
SELECT * FROM focus_today
WHERE category = 'business';

-- Personal Focus View
CREATE OR REPLACE VIEW personal_focus AS
SELECT * FROM focus_today
WHERE category = 'personal';

-- Domain Overview (replacing area_overview)
CREATE OR REPLACE VIEW domain_overview AS
SELECT 
    d.id as domain_id,
    d.name as domain_name,
    d.slug as domain_slug,
    COUNT(DISTINCT v.id) as venture_count,
    COUNT(DISTINCT p.id) as project_count,
    COUNT(DISTINCT t.id) as task_count,
    COUNT(DISTINCT CASE WHEN t.status IN ('Done', '✅ Done', 'completed') THEN t.id END) as completed_tasks,
    COUNT(DISTINCT CASE WHEN t.priority IN ('P1', '🔴 P1') THEN t.id END) as p1_tasks,
    COUNT(DISTINCT CASE WHEN t.priority IN ('P2', '🟡 P2') THEN t.id END) as p2_tasks,
    COUNT(DISTINCT CASE WHEN t.priority IN ('P3', '🟢 P3') THEN t.id END) as p3_tasks,
    d.is_active as active
FROM domains d
LEFT JOIN ventures v ON v.primary_domain_id = d.id
LEFT JOIN projects p ON p.domain_id = d.id
LEFT JOIN tasks t ON t.domain_id = d.id
GROUP BY d.id, d.name, d.slug, d.is_active
ORDER BY d.name;

-- Venture Overview
CREATE OR REPLACE VIEW venture_overview AS
SELECT 
    v.id as venture_id,
    v.name as venture_name,
    v.slug as venture_slug,
    d.name as domain_name,
    COUNT(DISTINCT p.id) as project_count,
    COUNT(DISTINCT t.id) as task_count,
    COUNT(DISTINCT CASE WHEN t.status IN ('Done', '✅ Done', 'completed') THEN t.id END) as completed_tasks,
    COUNT(DISTINCT CASE WHEN t.priority IN ('P1', '🔴 P1') THEN t.id END) as p1_tasks,
    COUNT(DISTINCT CASE WHEN t.priority IN ('P2', '🟡 P2') THEN t.id END) as p2_tasks,
    COUNT(DISTINCT CASE WHEN t.priority IN ('P3', '🟢 P3') THEN t.id END) as p3_tasks,
    v.is_active as active
FROM ventures v
LEFT JOIN domains d ON v.primary_domain_id = d.id
LEFT JOIN projects p ON p.venture_id = v.id
LEFT JOIN tasks t ON t.venture_id = v.id
GROUP BY v.id, v.name, v.slug, d.name, v.is_active
ORDER BY d.name, v.name;

-- Daily Schedule View
CREATE OR REPLACE VIEW daily_schedule AS
SELECT 
    t.id,
    t.title,
    v.name as venture,
    d.name as domain,
    p.name as project,
    t.priority,
    t.status,
    t.focus_date,
    t.focus_slot,
    t.due_date,
    t.assignee
FROM tasks t
LEFT JOIN ventures v ON t.venture_id = v.id
LEFT JOIN domains d ON t.domain_id = d.id
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.focus_date >= CURRENT_DATE
AND t.focus_date <= CURRENT_DATE + INTERVAL '7 days'
AND t.status NOT IN ('Done', '✅ Done', 'completed', 'on_hold', '⏸️ On Hold')
ORDER BY t.focus_date, t.focus_slot, t.priority;

-- Needs Scheduling View
CREATE OR REPLACE VIEW needs_scheduling AS
SELECT 
    t.id,
    t.title,
    v.name as venture,
    d.name as domain,
    p.name as project,
    t.priority,
    t.status,
    t.due_date,
    t.created_at,
    CASE 
        WHEN t.due_date < CURRENT_DATE THEN 'overdue'
        WHEN t.due_date = CURRENT_DATE THEN 'today'
        WHEN t.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'this_week'
        ELSE 'future'
    END as urgency
FROM tasks t
LEFT JOIN ventures v ON t.venture_id = v.id
LEFT JOIN domains d ON t.domain_id = d.id
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.focus_date IS NULL
AND t.status NOT IN ('Done', '✅ Done', 'completed', 'on_hold', '⏸️ On Hold')
ORDER BY 
    CASE 
        WHEN t.priority IN ('P1', '🔴 P1') THEN 1
        WHEN t.priority IN ('P2', '🟡 P2') THEN 2
        WHEN t.priority IN ('P3', '🟢 P3') THEN 3
        ELSE 4
    END,
    t.due_date NULLS LAST;

-- Needs Time Blocking View
CREATE OR REPLACE VIEW needs_time_blocking AS
SELECT 
    t.id,
    t.title,
    v.name as venture,
    d.name as domain,
    p.name as project,
    t.priority,
    t.status,
    t.focus_date,
    t.due_date
FROM tasks t
LEFT JOIN ventures v ON t.venture_id = v.id
LEFT JOIN domains d ON t.domain_id = d.id
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.focus_date IS NOT NULL
AND t.focus_slot IS NULL
AND t.status NOT IN ('✅ Done', '⏸️ On Hold')
ORDER BY t.focus_date, t.priority;

-- Today Time Blocks View
CREATE OR REPLACE VIEW today_time_blocks AS
WITH time_slots AS (
    SELECT unnest(ARRAY[
        '🌅 Morning Routine',
        '🎯 Deep Work Block 1',
        '📋 Admin Block 1',
        '🔋 Recharge & Rest',
        '🎯 Deep Work Block 2',
        '📋 Admin Block 2',
        '🌙 Shutdown Routine'
    ]) as slot
)
SELECT 
    ts.slot,
    COUNT(t.id) as task_count,
    STRING_AGG(t.title || ' (' || v.name || ')', ', ' ORDER BY t.priority) as tasks
FROM time_slots ts
LEFT JOIN tasks t ON t.focus_slot = ts.slot 
    AND t.focus_date = CURRENT_DATE
    AND t.status NOT IN ('Done', '✅ Done', 'completed', 'on_hold', '⏸️ On Hold')
LEFT JOIN ventures v ON t.venture_id = v.id
GROUP BY ts.slot
ORDER BY 
    CASE ts.slot
        WHEN '🌅 Morning Routine' THEN 1
        WHEN '🎯 Deep Work Block 1' THEN 2
        WHEN '📋 Admin Block 1' THEN 3
        WHEN '🔋 Recharge & Rest' THEN 4
        WHEN '🎯 Deep Work Block 2' THEN 5
        WHEN '📋 Admin Block 2' THEN 6
        WHEN '🌙 Shutdown Routine' THEN 7
    END;

-- Project Progress View
CREATE OR REPLACE VIEW project_progress AS
SELECT 
    p.id,
    p.name as project_name,
    v.name as venture_name,
    d.name as domain_name,
    p.status,
    p.priority,
    p.start_date,
    p.target_date,
    COUNT(DISTINCT t.id) as total_tasks,
    COUNT(DISTINCT CASE WHEN t.status IN ('Done', '✅ Done', 'completed') THEN t.id END) as completed_tasks,
    CASE 
        WHEN COUNT(DISTINCT t.id) > 0 
        THEN ROUND(COUNT(DISTINCT CASE WHEN t.status IN ('Done', '✅ Done', 'completed') THEN t.id END)::numeric / COUNT(DISTINCT t.id) * 100)
        ELSE 0
    END as completion_percentage,
    p.budget,
    p.budget_spent,
    p.revenue_generated,
    CASE 
        WHEN p.budget > 0 AND p.revenue_generated > 0
        THEN ROUND((p.revenue_generated - p.budget_spent) / p.budget * 100)
        ELSE 0
    END as roi_percentage
FROM projects p
LEFT JOIN ventures v ON p.venture_id = v.id
LEFT JOIN domains d ON p.domain_id = d.id
LEFT JOIN tasks t ON t.project_id = p.id
GROUP BY p.id, p.name, v.name, d.name, p.status, p.priority, 
         p.start_date, p.target_date, p.budget, p.budget_spent, p.revenue_generated
ORDER BY d.name, v.name, p.name;

-- Project Status View
CREATE OR REPLACE VIEW project_status AS
SELECT 
    *,
    CASE 
        WHEN status IN ('Complete', '✅ Complete', 'completed') THEN 'completed'
        WHEN target_date < CURRENT_DATE THEN 'overdue'
        WHEN completion_percentage >= 75 THEN 'on_track'
        WHEN completion_percentage >= 50 THEN 'at_risk'
        ELSE 'behind'
    END as health_status
FROM project_progress;

-- Domain Finance Totals (replacing area_finance_totals)
CREATE OR REPLACE VIEW domain_finance_totals AS
SELECT 
    d.id as domain_id,
    d.name as domain_name,
    COUNT(DISTINCT p.id) as project_count,
    COALESCE(SUM(p.budget), 0) as total_budget,
    COALESCE(SUM(p.budget_spent), 0) as total_spent,
    COALESCE(SUM(p.revenue_generated), 0) as total_revenue,
    COALESCE(SUM(p.revenue_generated) - SUM(p.budget_spent), 0) as net_profit
FROM domains d
LEFT JOIN projects p ON p.domain_id = d.id
GROUP BY d.id, d.name
ORDER BY d.name;

-- Finance ROI View
CREATE OR REPLACE VIEW finance_roi AS
SELECT 
    domain_id,
    domain_name,
    project_count,
    total_budget,
    total_spent,
    total_revenue,
    net_profit,
    CASE 
        WHEN total_spent > 0 
        THEN ROUND((net_profit / total_spent) * 100)
        ELSE 0
    END as roi_percentage,
    CASE 
        WHEN net_profit > 10000 THEN '🟢 High Performer'
        WHEN net_profit > 0 THEN '🟡 Profitable'
        WHEN net_profit = 0 THEN '⚪ Break Even'
        ELSE '🔴 Loss Making'
    END as performance_status
FROM domain_finance_totals
ORDER BY net_profit DESC;

-- Week Ahead View
CREATE OR REPLACE VIEW week_ahead AS
SELECT 
    DATE(day) as date,
    TO_CHAR(day, 'Day') as day_name,
    COUNT(t.id) as task_count,
    COUNT(CASE WHEN t.priority IN ('P1', '🔴 P1') THEN 1 END) as p1_count,
    COUNT(CASE WHEN t.priority IN ('P2', '🟡 P2') THEN 1 END) as p2_count,
    COUNT(CASE WHEN t.priority IN ('P3', '🟢 P3') THEN 1 END) as p3_count
FROM generate_series(
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '6 days',
    INTERVAL '1 day'
) AS day
LEFT JOIN tasks t ON t.focus_date = DATE(day)
    AND t.status NOT IN ('Done', '✅ Done', 'completed', 'on_hold', '⏸️ On Hold')
GROUP BY day
ORDER BY day;

-- System Inventory View
CREATE OR REPLACE VIEW system_inventory AS
SELECT 
    'domains' as entity_type,
    COUNT(*) as count,
    COUNT(CASE WHEN is_active THEN 1 END) as active_count
FROM domains
UNION ALL
SELECT 
    'ventures' as entity_type,
    COUNT(*) as count,
    COUNT(CASE WHEN is_active THEN 1 END) as active_count
FROM ventures
UNION ALL
SELECT 
    'projects' as entity_type,
    COUNT(*) as count,
    COUNT(CASE WHEN status = 'Active' THEN 1 END) as active_count
FROM projects
UNION ALL
SELECT 
    'milestones' as entity_type,
    COUNT(*) as count,
    COUNT(CASE WHEN status IN ('in_progress', 'planned') THEN 1 END) as active_count
FROM milestones
UNION ALL
SELECT 
    'tasks' as entity_type,
    COUNT(*) as count,
    COUNT(CASE WHEN status NOT IN ('Done', '✅ Done', 'completed', 'on_hold', '⏸️ On Hold') THEN 1 END) as active_count
FROM tasks
ORDER BY entity_type;

-- ============================================
-- STEP 6: CREATE INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tasks_domain_id ON tasks(domain_id);
CREATE INDEX IF NOT EXISTS idx_tasks_venture_id ON tasks(venture_id);
CREATE INDEX IF NOT EXISTS idx_tasks_notion_page_id ON tasks(notion_page_id);
CREATE INDEX IF NOT EXISTS idx_tasks_focus_date ON tasks(focus_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

CREATE INDEX IF NOT EXISTS idx_projects_domain_id ON projects(domain_id);
CREATE INDEX IF NOT EXISTS idx_projects_venture_id ON projects(venture_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- ============================================
-- STEP 7: DROP THE AREAS TABLE (OPTIONAL)
-- ============================================
-- Only uncomment if you're sure you don't need it anymore
-- DROP TABLE IF EXISTS areas CASCADE;

-- ============================================
-- STEP 8: SUMMARY
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 COMPLETE MIGRATION SUCCESSFUL!';
    RAISE NOTICE '================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Changes Applied:';
    RAISE NOTICE '  • All views recreated with domain/venture structure';
    RAISE NOTICE '  • RPC function uses ventures instead of areas';
    RAISE NOTICE '  • Projects table now has domain_id';
    RAISE NOTICE '  • Tasks table now has domain_id and notion_page_id';
    RAISE NOTICE '  • Area column made optional in projects';
    RAISE NOTICE '  • All indexes created for performance';
    RAISE NOTICE '';
    RAISE NOTICE '📊 New View Structure:';
    RAISE NOTICE '  • domain_overview (replaces area_overview)';
    RAISE NOTICE '  • venture_overview (new)';
    RAISE NOTICE '  • All time-blocking views updated';
    RAISE NOTICE '  • Finance views use domains';
    RAISE NOTICE '';
    RAISE NOTICE '🔄 Bridge Sync:';
    RAISE NOTICE '  • Use venture name in Notion';
    RAISE NOTICE '  • Domain, Venture, Priority all required';
    RAISE NOTICE '  • RPC expects: create_or_update_task(title, venture_name, ...)';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Note: areas table still exists but is no longer used';
    RAISE NOTICE '  Run "DROP TABLE areas CASCADE;" when ready to remove';
END $$;
