# 🔄 Task Type Migration Guide

## Overview
This migration transforms your system from **brand-centric** to **task-type** structure:
- **Before**: Brand (hikma, aivant, etc.) → Projects → Tasks
- **After**: Task Type (business/personal) → Projects → Tasks

## 📋 Migration Steps

### Step 1: Run Database Migration
Execute in your Supabase SQL Editor:
```sql
-- Copy and paste the entire contents of:
-- migrations/004_task_type_migration.sql
```

### Step 2: Update Notion Database Structure
In your **"Quick Capture (Supabase)"** Notion database:

1. **Add "Task Type" Property:**
   - Type: Select
   - Options: `Business`, `Personal`
   - Default: `Business`

2. **Remove "Brand" Property** (or keep for reference)

3. **Your new structure:**
   ```
   ✅ Title (Title)
   🔄 Task Type (Select: Business/Personal) 
   📁 Project (Rich Text)
   🎯 Milestone (Rich Text)
   🔴 Priority (Select: P1/P2)
   📅 Due (Date)
   👤 Assignee (Rich Text)
   🔗 Supabase Task ID (Rich Text)
   ✅ Linked ✅ (Checkbox)
   ```

### Step 3: Deploy Updated Bridge
The bridge code has been updated and committed. Railway will auto-deploy:

```bash
git push  # Triggers Railway deployment
```

### Step 4: Verify Migration
Run these queries in Supabase to verify:

```sql
-- Check projects by task_type
SELECT task_type, COUNT(*) as project_count 
FROM projects 
GROUP BY task_type;

-- Check new views work
SELECT * FROM focus_today LIMIT 5;
SELECT * FROM project_status;

-- Test new RPC
SELECT create_task_from_capture_with_task_type(
  'Test Migration Task',
  'personal',
  'Test Personal Project',
  'Test Phase',
  'P1'
);
```

## 🎯 How It Works Now

### Business Tasks
```
Task Type: Business
Project: Hikma Digital
Milestone: Website Launch
→ Creates business project for your ventures
```

### Personal Tasks  
```
Task Type: Personal
Project: Trip to USA
Milestone: Planning Phase
→ Creates personal project for life goals
```

## 📊 New Views

### Focus Today
Shows both business and personal priorities:
```sql
SELECT * FROM focus_today 
WHERE task_type = 'business';  -- Business focus

SELECT * FROM focus_today 
WHERE task_type = 'personal';  -- Personal focus
```

### Project Status
Cross-type project health:
```sql
SELECT task_type, project_name, health_score, progress_pct
FROM project_status
ORDER BY task_type, health_score DESC;
```

## 🔧 Troubleshooting

### Bridge Errors
- **"Function not found"**: Run the migration SQL first
- **"Invalid task_type"**: Ensure Notion has "Business"/"Personal" options
- **"Property not found"**: Add "Task Type" property to Notion database

### Data Issues
- **Missing projects**: All existing projects moved to "business" task_type
- **Lost tasks**: No tasks are lost, all relationships preserved
- **Notion sync**: Update existing Notion pages to use new structure

## 📈 What You Gain

1. **Clearer Mental Model**: Business vs Personal separation
2. **Better Project Names**: "Trip to USA" vs forcing into brands
3. **Unified Priorities**: Personal P1s compete with business P1s
4. **Flexible Structure**: Add any project type without brand constraints

## 🎉 Success Criteria

✅ Database migration completes without errors  
✅ New RPC function works  
✅ Bridge deploys successfully  
✅ Notion "Task Type" field added  
✅ Test task creates properly  
✅ Views show task_type data  

Your multi-venture operating system now handles both business execution and personal excellence in one unified command center! 🚀