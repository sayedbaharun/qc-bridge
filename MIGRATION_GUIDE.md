# QC Bridge Migration to 3-Layer Domain Model

## Overview

This migration transforms your QC Bridge from a simple `brands → projects → tasks` structure to a sophisticated 3-layer model: `domains → ventures → projects → tasks`.

## New Architecture

```
Domains (9)          Ventures (18)         Projects            Tasks
───────────         ──────────────        ─────────          ────────
Health        ───── gym-training    ───── Workout Plan ───── Daily cardio
                  ├─ nutrition      ───── Meal Prep    ───── Weekly prep
                  ├─ medical        ───── Checkups     ───── Annual physical
                  └─ mindset        ───── Meditation   ───── Morning practice

Work          ───── hikma          ───── Q4 Strategy  ───── Market analysis
                  ├─ aivant-realty  ───── Dubai Tower  ───── Site inspection
                  ├─ arab-money     ───── Podcast S2   ───── Guest research
                  └─ mydub          ───── App Launch   ───── Beta testing

Finance       ───── investments    ───── Portfolio    ───── Stock research
                  ├─ personal-finance ─── Budget 2025  ───── Monthly review
                  └─ tax-planning   ───── Tax Prep     ───── Gather docs

Learning      ───── rera-exam      ───── Exam Prep    ───── Practice tests
                  ├─ courses        ───── React Course ───── Module 3
                  └─ reading-list   ───── Q4 Books     ───── Deep Work

...and 5 more domains: Family, Home, Travel, Relationships, Play
```

## Migration Steps

### Step 1: Clean Slate (Safe)
```bash
# First, do a dry run to see what would be cleared
npm run clean-slate -- --dry-run

# Review the output, then clear all data when ready
npm run clean-slate -- --confirm
```

**What this does:**
- ✅ Clears all tasks, projects, brands, milestones
- ✅ Resets sync state for fresh start
- ✅ Preserves table structures
- ✅ Safe and reversible

### Step 2: Setup New Structure
```bash
# Create the new 3-layer domain model
npm run setup-domains
```

**What this creates:**
- ✅ **9 Domains**: Health, Work, Finance, Family, Home, Travel, Learning, Relationships, Play
- ✅ **18 Ventures**: Specific business/life activities under domains
- ✅ **Compatibility layer**: `v_areas_compat` view and `resolve_area_to_structure()` function
- ✅ **Enhanced RPC**: Updated `create_or_update_task` with domain/venture support
- ✅ **Area mappings**: Bridge between old area names and new structure

### Step 3: Test the Bridge
```bash
# Test that everything works without creating real data
npm run dry-run
```

### Step 4: Create Test Task in Notion
Create a task in your Notion "Quick Capture" database with:
- **Title**: "Test new domain structure"
- **Area**: "health" (or "hikma" for a work venture)
- **Project**: "Migration Test"
- **Priority**: "🟡 P2"

### Step 5: Sync and Verify
```bash
# Run the sync to create your first task with new structure
npm run once
```

## How Area Mapping Works

The bridge now intelligently maps area names to the new structure:

### Direct Domain Mapping
- `health` → Health domain
- `work` → Work domain  
- `finance` → Finance domain
- `learning` → Learning domain

### Venture Mapping
- `hikma` → Hikma venture (under Work domain)
- `nutrition` → Nutrition venture (under Health domain)
- `investments` → Investments venture (under Finance domain)
- `rera-exam` → RERA Exam venture (under Learning domain)

### Resolution Process
1. **Exact match**: Check if area name matches a venture slug
2. **Domain match**: Check if area name matches a domain slug  
3. **Compatibility mapping**: Use `area_compat_map` for custom mappings
4. **Error**: Reject unrecognized areas

## Database Changes

### New Tables
```sql
-- Top-level areas of focus
CREATE TABLE domains (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE,     -- 'health', 'work', etc.
  name TEXT,           -- 'Health', 'Work', etc.
  description TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Sub-areas under domains
CREATE TABLE ventures (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE,              -- 'hikma', 'nutrition', etc.
  name TEXT,                    -- 'Hikma', 'Nutrition', etc.
  description TEXT,
  primary_domain_id UUID,       -- References domains(id)
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Legacy area name → new structure mapping
CREATE TABLE area_compat_map (
  legacy_area_key TEXT PRIMARY KEY,  -- Old area names
  domain_id UUID,                   -- Maps to domain OR
  venture_id UUID,                  -- Maps to venture
  created_at TIMESTAMPTZ
);
```

### Enhanced Projects Table
```sql
-- Projects now link to the new structure
ALTER TABLE projects 
ADD COLUMN area TEXT,                    -- Area name for compatibility
ADD COLUMN venture_id UUID;             -- Links to ventures table
```

### Compatibility Layer
```sql
-- View that presents unified "areas" interface
CREATE VIEW v_areas_compat AS ...

-- Function to resolve area names
CREATE FUNCTION resolve_area_to_structure(area_name TEXT) 
RETURNS TABLE(resolved_type TEXT, domain_slug TEXT, venture_slug TEXT) ...
```

## What Happens to Your Data

### Before Migration
```
brands: ['health', 'hikma', 'business', 'personal']
projects: [
  {name: 'Workout Plan', brand_id: 'health'},
  {name: 'Q4 Strategy', brand_id: 'hikma'}
]
tasks: [Many tasks linked to projects]
```

### After Migration
```
domains: ['health', 'work', 'finance', ...] (9 total)
ventures: ['hikma', 'nutrition', 'gym-training', ...] (18 total)
area_compat_map: [
  {'health' → health domain},
  {'hikma' → hikma venture},
  ...
]
projects: [] (empty, ready for new structure)
tasks: [] (empty, ready for rebuild)
```

## Bridge Behavior Changes

### Before (Simple)
```javascript
// Notion: Area = "health"
// Bridge: Creates brand "health" if not exists
// Result: Task under "health" brand
```

### After (Smart Resolution)
```javascript
// Notion: Area = "health"  
// Bridge: Resolves to Health domain
// Result: Task under Health domain, no venture

// Notion: Area = "hikma"
// Bridge: Resolves to Hikma venture under Work domain  
// Result: Task under Hikma venture, Work domain context
```

## Rollback Plan

If you need to rollback:

### Option 1: Restore from Backup
```bash
# Restore your database from before migration
# Then revert to previous bridge version
```

### Option 2: Recreate Legacy Structure
```bash
# Run clean slate again
npm run clean-slate -- --confirm

# Manually recreate your brands as needed
# Previous bridge code will work
```

## Monitoring Migration

### Success Indicators
- ✅ `npm run dry-run` completes without errors
- ✅ Area resolution works: `SELECT * FROM resolve_area_to_structure('health')`
- ✅ First task syncs successfully
- ✅ Task appears in correct domain/venture context

### Warning Signs
- ❌ "Area could not be resolved" errors
- ❌ Tasks not appearing in expected structure
- ❌ RPC function errors

## Notion Setup Requirements

Ensure your Notion "Quick Capture" database has these properties:
- **Title** (title)
- **Area** (select) - Options should include: health, work, finance, hikma, nutrition, etc.
- **Project** (text)  
- **Milestone** (text)
- **Priority** (select)
- **Due** (date)
- **Assignee** (text)
- **Status** (select)
- **Focus Slot** (select)
- **Focus Date** (date)
- **Supabase Task ID** (text) - Auto-populated by bridge
- **Linked ✅** (checkbox) - Auto-populated by bridge

## Post-Migration Tasks

1. **Update Notion Area options** to include both domains and ventures
2. **Create project templates** using the new Notion databases
3. **Train users** on the new area naming conventions
4. **Monitor sync logs** for any resolution issues
5. **Create views** in Supabase for domain/venture reporting

## Benefits of New Structure

### For Users
- **Clearer organization**: Life domains vs specific ventures
- **Better project context**: Projects inherit domain meaning
- **Flexible categorization**: Both high-level and specific areas
- **Future-proof**: Ready for multi-level hierarchies

### For System
- **Consistent taxonomy**: Predefined domains and ventures
- **Better reporting**: Roll up from ventures to domains
- **Scalable**: Easy to add new ventures under existing domains
- **Maintainable**: Clear data relationships

## Support

If you encounter issues:

1. **Check logs**: Look for "Area could not be resolved" messages
2. **Test resolution**: Use `resolve_area_to_structure('your_area')` function
3. **Verify mappings**: Check `area_compat_map` table
4. **Rollback if needed**: Use the rollback plan above

The migration is designed to be safe and reversible. Take it step by step and verify each phase before proceeding.