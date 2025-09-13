# 🔄 QC-Bridge Migration Plan & System Architecture

## 📋 Table of Contents
1. [Current System State](#current-system-state)
2. [Problem Analysis](#problem-analysis)
3. [Migration Strategy](#migration-strategy)
4. [Implementation Plan](#implementation-plan)
5. [View Dependencies](#view-dependencies)
6. [Testing Checklist](#testing-checklist)
7. [Rollback Plan](#rollback-plan)

---

## 🏗️ Current System State

### Database Structure Overview

The system has evolved from an **area-based** model to a **domain/venture-based** hierarchy:

```
OLD STRUCTURE (Legacy):
areas (table) → projects → milestones → tasks
  ↓
Used by 12+ critical views

NEW STRUCTURE (Target):
domains → ventures → projects → milestones → tasks
```

### Current Tables

#### **areas** (Legacy table - still in use)
- Contains 14+ areas (business & personal)
- Referenced by `projects.area` column
- Used by multiple critical views

#### **domains** (New structure)
- 9 domains: health, work, finance, family, home, travel, learning, relationships, play
- Primary categorization level

#### **ventures** (New structure)
- 17 ventures linked to domains via `primary_domain_id`
- Examples: hikma, investments, aivant-realty

#### **projects**
- Has `area` column (TEXT, NOT NULL) - legacy
- Has `venture_id` column (UUID) - new
- Missing `domain_id` column - needs to be added
- Empty table currently (no data to migrate)

#### **tasks**
- Missing `notion_page_id` column for tracking
- Has `venture_id` column
- Empty table currently

### Critical Views Dependent on `projects.area`

1. **Time Management Views:**
   - `focus_today` - Today's scheduled tasks
   - `daily_schedule` - Time-blocked schedule
   - `today_time_blocks` - Time slot organization
   - `needs_time_blocking` - Unscheduled tasks
   - `needs_scheduling` - Priority scheduling queue

2. **Focus Views:**
   - `business_focus` - Business area tasks
   - `personal_focus` - Personal area tasks

3. **Overview & Analytics:**
   - `area_overview` - Area statistics and metrics
   - `project_progress` - Project completion tracking
   - `project_status` - Project health indicators

4. **Financial Views:**
   - `area_finance_totals` - Financial metrics by area
   - `finance_roi` - ROI calculations

### RPC Functions

- **Multiple versions exist** causing conflicts
- Need to consolidate to single `create_or_update_task` function
- Function must handle both legacy area and new venture/domain structure

---

## 🔍 Problem Analysis

### Core Issues

1. **Column Dependencies**
   - `projects.area` is NOT NULL and required by 12+ views
   - Cannot drop without CASCADE (would break all views)
   - Views use area for filtering and grouping

2. **RPC Conflicts**
   - Two versions of `create_or_update_task` exist
   - Causing "cannot choose best candidate" errors
   - One version references non-existent columns

3. **Missing Columns**
   - `tasks.notion_page_id` needed for sync tracking
   - `projects.domain_id` needed for new hierarchy

4. **Bridge Compatibility**
   - Bridge expects venture-based structure
   - RPC needs to map ventures to areas for compatibility

### Data Flow Requirements

```
Notion Quick Capture
    ↓
Domain + Venture + Priority (all required)
    ↓
Bridge Sync (qc-bridge)
    ↓
RPC: create_or_update_task(area=venture_name)
    ↓
Creates hierarchy:
  - Find/create venture
  - Find/create project (with area + domain_id)
  - Find/create milestone
  - Create/update task
    ↓
Updates Notion with Supabase ID
```

---

## 📐 Migration Strategy

### Approach: Gradual Migration with Compatibility Layer

**Key Principle:** Keep everything working while transitioning to new structure.

### Phase 1: Add New Structure (Keep Old)
- Add `domain_id` to projects
- Add `notion_page_id` to tasks
- Keep `area` column for view compatibility
- Sync `area` with domain names

### Phase 2: Update RPC & Bridge
- Fix RPC function conflicts
- Make RPC handle both structures
- Ensure bridge sync works

### Phase 3: Update Views (Future)
- Gradually update views to use `domain_id`
- Create transition views
- Eventually drop `area` column

---

## 🛠️ Implementation Plan

### Step 1: Apply Safe Migration Script

```sql
-- File: sql/fix_schema_safe.sql

-- This script:
-- 1. Drops conflicting RPC functions
-- 2. Adds domain_id to projects (keeps area)
-- 3. Adds notion_page_id to tasks
-- 4. Creates working RPC function
-- 5. Syncs area column with domain names
```

**Key Features:**
- **Preserves all views** - area column stays
- **Adds new columns** - domain_id, notion_page_id
- **Fixes RPC conflicts** - single clean function
- **Maintains compatibility** - area = domain name

### Step 2: Verify Bridge Sync

1. Test with dry-run:
   ```bash
   npm run dry-run
   ```

2. Check task requirements:
   - Domain ✅
   - Venture ✅
   - Priority ✅

3. Run actual sync:
   ```bash
   npm run once
   ```

### Step 3: Monitor Views

Check that all views still work:
```sql
-- Test each view
SELECT COUNT(*) FROM focus_today;
SELECT COUNT(*) FROM business_focus;
SELECT COUNT(*) FROM area_overview;
-- etc.
```

---

## 🔗 View Dependencies

### View Hierarchy & Dependencies

```
area column (projects.area)
    ├── focus_today
    │   ├── business_focus (depends on focus_today)
    │   └── personal_focus (depends on focus_today)
    ├── area_overview
    ├── today_time_blocks
    ├── needs_time_blocking
    ├── daily_schedule
    ├── needs_scheduling
    ├── project_progress
    │   └── project_status (depends on project_progress)
    └── area_finance_totals
        └── finance_roi (depends on area_finance_totals)
```

### View Definitions (Key Parts)

Most views use `projects.area` for:
- **Filtering**: `WHERE p.area IN ('hikma', 'health', ...)`
- **Grouping**: `GROUP BY p.area`
- **Joining**: `JOIN areas a ON p.area = a.key`

### Migration Path for Views

1. **Short-term**: Keep area column, sync with domain names
2. **Medium-term**: Create parallel views using domain_id
3. **Long-term**: Switch all views to domain_id, drop area

---

## ✅ Testing Checklist

### Pre-Migration
- [ ] Backup database
- [ ] Document current RPC function definitions
- [ ] List all views and their dependencies
- [ ] Test current bridge sync status

### During Migration
- [ ] Verify domain_id populated correctly
- [ ] Check area column synced with domain names
- [ ] Confirm notion_page_id column added
- [ ] Test RPC function with sample data

### Post-Migration
- [ ] All views return data without errors
- [ ] Bridge sync completes successfully
- [ ] Tasks created with proper hierarchy
- [ ] Notion pages updated with Supabase IDs
- [ ] No duplicate RPC function errors

### Functional Tests
- [ ] Create task via Notion → syncs to Supabase
- [ ] Task appears in appropriate views
- [ ] Time blocking views show correct data
- [ ] Financial views calculate correctly
- [ ] Area overview shows accurate counts

---

## 🔙 Rollback Plan

### If Migration Fails

1. **Restore RPC functions**:
   ```sql
   -- Restore original RPC if needed
   DROP FUNCTION IF EXISTS create_or_update_task;
   -- Re-create original version
   ```

2. **Remove added columns** (if necessary):
   ```sql
   ALTER TABLE projects DROP COLUMN IF EXISTS domain_id;
   ALTER TABLE tasks DROP COLUMN IF EXISTS notion_page_id;
   ```

3. **Restore from backup** (worst case):
   - Use Supabase dashboard backup restore
   - Re-sync from Notion

---

## 📊 System Architecture (Final State)

### Hierarchy
```
Domains (9)
  └── Ventures (17+)
      └── Projects (dynamic)
          └── Milestones (dynamic)
              └── Tasks (main work items)
```

### Key Relationships
- **Venture → Domain**: via `primary_domain_id`
- **Project → Venture**: via `venture_id`
- **Project → Domain**: via `domain_id` (new)
- **Task → Venture**: via `venture_id`
- **Task → Project**: via `project_id` (optional)
- **Task → Notion**: via `notion_page_id` (new)

### Bridge Sync Flow
```
Notion Properties        →  Supabase Columns
─────────────────────────────────────────────
Task (title)            →  tasks.title
Domain (select)         →  (used to find venture)
Venture (select)        →  tasks.venture_id
Project (text)          →  tasks.project_id
Milestone (text)        →  tasks.milestone_id
Priority (select)       →  tasks.priority
Status (select)         →  tasks.status
Focus Date (date)       →  tasks.focus_date
Focus Slot (select)     →  tasks.focus_slot
Due Date (date)         →  tasks.due_date
Supabase Task ID (text) ←  tasks.id
Linked (checkbox)       ←  (set when synced)
```

---

## 🎯 Success Criteria

The migration is successful when:

1. **Bridge syncs without errors** ✅
2. **All views continue to work** ✅
3. **Tasks create proper hierarchy** ✅
4. **No RPC conflicts** ✅
5. **Notion integration maintained** ✅
6. **Time blocking functionality preserved** ✅
7. **Financial tracking unaffected** ✅

---

## 📝 Notes & Considerations

### Why Keep the Area Column?

1. **12+ views depend on it** - Would require rewriting all views
2. **Time blocking system uses it** - Critical functionality
3. **Financial views need it** - ROI calculations
4. **Safe migration path** - No breaking changes

### Future Optimization

Once the system is stable:
1. Create new views using domain_id
2. Test thoroughly
3. Switch applications to new views
4. Deprecate old views
5. Finally drop area column

### Bridge Configuration

The bridge uses these environment variables:
- `NOTION_TOKEN` - Notion API key
- `NOTION_DATABASE_ID` - Quick Capture database
- `SUPABASE_URL` - Database URL
- `SUPABASE_SERVICE_ROLE` - Service role key

---

## 🚀 Next Actions

1. **Run safe migration script** in Supabase SQL Editor
2. **Test bridge sync** with a sample task
3. **Verify all views** still functioning
4. **Monitor for 24 hours** before considering further changes
5. **Document any issues** for future reference

---

*Last Updated: 2025-09-12*
*Version: 1.0*
