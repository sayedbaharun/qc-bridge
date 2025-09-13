-- Fix for the week_ahead view GROUP BY error
-- Run this if you get the "generate_series must appear in GROUP BY" error

-- First drop the broken view if it exists
DROP VIEW IF EXISTS week_ahead CASCADE;

-- Create the corrected version
CREATE OR REPLACE VIEW week_ahead AS
SELECT 
    DATE(day) as date,
    TO_CHAR(day, 'Day') as day_name,
    COUNT(t.id) as task_count,
    COUNT(CASE WHEN t.priority = '🔴 P1' THEN 1 END) as p1_count,
    COUNT(CASE WHEN t.priority = '🟡 P2' THEN 1 END) as p2_count,
    COUNT(CASE WHEN t.priority = '🟢 P3' THEN 1 END) as p3_count
FROM generate_series(
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '6 days',
    INTERVAL '1 day'
) AS day  -- Using 'day' as alias instead of 'generate_series'
LEFT JOIN tasks t ON t.focus_date = DATE(day)
    AND t.status NOT IN ('✅ Done', '⏸️ On Hold')
GROUP BY day  -- Group by the actual column alias
ORDER BY day;

-- Test the view
SELECT * FROM week_ahead;
