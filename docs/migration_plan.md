# Supabase Database Migration Plan: Brands → Task Types

## Current Database Snapshot (Analysis Date: 2025-09-08)

### 🏢 Current Brands (7 total)
All brands are currently active and created on 2025-09-07:

| Key | Name | Status |
|-----|------|--------|
| hikma | Hikma Digital | Active |
| aivant | Aivant Realty | Active |
| arabmoney | Arab Money Official | Active |
| amo | AMO Syndicate | Active |
| mydub | MyDub.ai | Active |
| gmtD | GetMeToDub.ai | Active |
| revolv | Revolv Group | Active |

**Key Finding**: Brands table uses `key` as primary identifier, not `id`. All brands reference string keys.

### 📁 Current Projects (3 total)
All projects are currently assigned to "hikma" brand:

| Name | Brand | Status | Budget | Tasks |
|------|-------|--------|--------|-------|
| Strategic Partnership Alpha | hikma | ✅ Complete | $8,000 | 10 tasks |
| Hikma Digital – Infrastructure | hikma | 🔵 Planning | $25,000 | 6 tasks |
| Arab Money Official – Launch | hikma | 🔵 Planning | $40,000 | 2 tasks |

**Key Finding**: Projects use `brand` column (text) referencing brand keys, not foreign key relationships.

### 📝 Current Tasks (18 total)
- All 18 tasks are properly assigned to projects
- 0 orphaned tasks
- Task distribution:
  - Strategic Partnership Alpha: 10 tasks
  - Hikma Digital – Infrastructure: 6 tasks  
  - Arab Money Official – Launch: 2 tasks

### 🎯 Current Milestones (6 total)
All milestones are properly linked to projects with clear phases.

## Migration Strategy

### Current Structure
```
brands (key-based) → projects (brand column) → tasks → milestones
```

### Target Structure
```
task_types (id-based) → projects (task_type_id column) → tasks → milestones
```

## 🚨 Critical Issues Identified

1. **Brand Usage Pattern**: 
   - 7 brands exist but only "hikma" is used by projects
   - 6 brands are completely unused (aivant, arabmoney, amo, mydub, gmtD, revolv)

2. **Data Model Inconsistency**:
   - Brands table uses `key` as identifier
   - Projects reference brands via text `brand` column, not foreign keys
   - No referential integrity constraints

3. **Business Logic Mismatch**:
   - Current project names suggest they should belong to different brands:
     - "Arab Money Official – Launch" → should be arabmoney brand
     - But all are assigned to "hikma"

## 📋 Safe Migration Plan

### Phase 1: Pre-Migration Preparation
1. **Create Database Backup**
   ```sql
   -- Full database backup recommended
   ```

2. **Create task_types Table**
   ```sql
   CREATE TABLE task_types (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL UNIQUE,
     description TEXT,
     active BOOLEAN DEFAULT true,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. **Insert Initial Task Types**
   ```sql
   INSERT INTO task_types (name, description) VALUES 
   ('business', 'Business-related projects and tasks'),
   ('personal', 'Personal projects and tasks');
   ```

### Phase 2: Schema Migration
1. **Add task_type_id to projects table**
   ```sql
   ALTER TABLE projects 
   ADD COLUMN task_type_id UUID REFERENCES task_types(id);
   ```

2. **Set all existing projects to 'business' task type**
   ```sql
   UPDATE projects 
   SET task_type_id = (SELECT id FROM task_types WHERE name = 'business');
   ```

3. **Make task_type_id required after data migration**
   ```sql
   ALTER TABLE projects 
   ALTER COLUMN task_type_id SET NOT NULL;
   ```

### Phase 3: Application Code Updates
1. **Update create_task_from_capture_by_names function**
   - Change parameter from `p_brand` to `p_task_type` 
   - Update logic to use task_types instead of brands

2. **Update all queries**
   - Replace brand-based filtering with task_type-based filtering
   - Update join conditions

3. **Update UI components**
   - Change brand selectors to task type selectors
   - Update labels and terminology

### Phase 4: Data Cleanup
1. **Verify data integrity**
   ```sql
   -- Check all projects have task_type_id
   SELECT COUNT(*) FROM projects WHERE task_type_id IS NULL;
   
   -- Verify task relationships
   SELECT p.name, tt.name as task_type, COUNT(t.id) as task_count
   FROM projects p
   LEFT JOIN task_types tt ON p.task_type_id = tt.id
   LEFT JOIN tasks t ON t.project_id = p.id
   GROUP BY p.id, p.name, tt.name;
   ```

2. **Remove brand column after verification**
   ```sql
   ALTER TABLE projects DROP COLUMN brand;
   ```

3. **Drop brands table**
   ```sql
   DROP TABLE brands;
   ```

## ⚠️ Data Preservation Concerns

### Unused Brands
The following brands have no associated projects and will be lost:
- Aivant Realty
- Arab Money Official  
- AMO Syndicate
- MyDub.ai
- GetMeToDub.ai
- Revolv Group

**Recommendation**: Before migration, decide if these should:
1. Be preserved as empty projects under "business" task type
2. Be documented and archived separately
3. Be permanently removed

### Project-Brand Misalignment
- "Arab Money Official – Launch" project is assigned to "hikma" brand
- This may indicate data entry error or business logic change
- **Action Required**: Verify correct brand assignment before migration

## 🔄 Rollback Plan

1. **If migration fails mid-process**:
   - Restore from database backup
   - Fix issues and retry

2. **If issues discovered after migration**:
   - Keep backup until migration is fully validated
   - Can restore brands table and brand column if needed

## ✅ Migration Validation Checklist

- [ ] Database backup completed
- [ ] task_types table created and populated
- [ ] All projects have valid task_type_id
- [ ] Application code updated and tested
- [ ] All tasks still properly linked to projects
- [ ] All milestones still properly linked to projects  
- [ ] UI displays task types instead of brands
- [ ] create_task_from_capture_by_names function works with new schema
- [ ] No broken references or orphaned records

## 📊 Expected Final State

### Task Types (2 total)
| Name | Description | Projects |
|------|-------------|----------|
| business | Business-related projects | 3 projects (all current) |
| personal | Personal projects | 0 projects (for future use) |

### Projects (3 total - unchanged)
All existing projects will be preserved under "business" task type:
- Strategic Partnership Alpha
- Hikma Digital – Infrastructure  
- Arab Money Official – Launch

### Tasks (18 total - unchanged)
All existing tasks and their relationships will be preserved.

## 🚀 Next Steps

1. **Review this migration plan** with stakeholders
2. **Schedule migration window** (estimated 2-4 hours)
3. **Test migration on staging environment** first
4. **Execute migration** following this plan
5. **Validate results** using the checklist above

---

*This analysis was generated on 2025-09-08 for database: https://eztiekundrsdpwiomlyc.supabase.co*