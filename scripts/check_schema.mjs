#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🔍 Checking Database Schema for Bridge Compatibility');
console.log('====================================================\n');

async function getTableColumns(tableName) {
  try {
    const { data, error } = await supabase.from(tableName).select('*').limit(0);
    if (error) return null;
    
    // Get column names from a test query
    const { data: sample } = await supabase.from(tableName).select('*').limit(1);
    if (sample && sample.length > 0) {
      return Object.keys(sample[0]);
    }
    
    // If no data, we can't detect columns this way
    return 'empty';
  } catch (e) {
    return null;
  }
}

async function checkSchema() {
  const issues = [];
  const fixes = [];
  
  console.log('1. Checking core tables...\n');
  
  // Check tasks table
  console.log('📋 TASKS table:');
  const taskCols = await getTableColumns('tasks');
  if (!taskCols) {
    issues.push('❌ tasks table does not exist');
    fixes.push('CREATE TABLE tasks (see sql below)');
  } else {
    console.log('✅ Table exists');
    
    // Expected columns for tasks
    const requiredTaskCols = [
      'id', 'name', 'project_id', 'milestone_id', 
      'priority', 'status', 'due_date', 'focus_date', 'focus_slot',
      'assignee_email', 'notion_page_id', 'external_hash',
      'created_at', 'updated_at'
    ];
    
    if (taskCols === 'empty') {
      console.log('   ⚠️  Table is empty, cannot verify columns');
    } else {
      const missing = requiredTaskCols.filter(col => !taskCols.includes(col));
      if (missing.length > 0) {
        issues.push(`❌ tasks table missing columns: ${missing.join(', ')}`);
        missing.forEach(col => {
          if (col === 'notion_page_id') fixes.push('ALTER TABLE tasks ADD COLUMN notion_page_id TEXT;');
          if (col === 'external_hash') fixes.push('ALTER TABLE tasks ADD COLUMN external_hash TEXT;');
          if (col === 'focus_date') fixes.push('ALTER TABLE tasks ADD COLUMN focus_date DATE;');
          if (col === 'focus_slot') fixes.push('ALTER TABLE tasks ADD COLUMN focus_slot TEXT;');
          if (col === 'assignee_email') fixes.push('ALTER TABLE tasks ADD COLUMN assignee_email TEXT;');
          if (col === 'updated_at') fixes.push('ALTER TABLE tasks ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();');
        });
      }
    }
  }
  
  // Check projects table
  console.log('\n📋 PROJECTS table:');
  const projectCols = await getTableColumns('projects');
  if (!projectCols) {
    issues.push('❌ projects table does not exist');
    fixes.push('CREATE TABLE projects (see sql below)');
  } else {
    console.log('✅ Table exists');
    
    // Check for venture_id column
    if (projectCols !== 'empty' && !projectCols.includes('venture_id')) {
      issues.push('❌ projects table missing venture_id column');
      fixes.push('ALTER TABLE projects ADD COLUMN venture_id UUID REFERENCES ventures(id);');
    }
  }
  
  // Check milestones table
  console.log('\n📋 MILESTONES table:');
  const milestoneCols = await getTableColumns('milestones');
  if (!milestoneCols) {
    issues.push('❌ milestones table does not exist');
    fixes.push('CREATE TABLE milestones (see sql below)');
  } else {
    console.log('✅ Table exists');
  }
  
  // Check integrations_notion table
  console.log('\n📋 INTEGRATIONS_NOTION table:');
  const integrationCols = await getTableColumns('integrations_notion');
  if (!integrationCols) {
    issues.push('❌ integrations_notion table does not exist');
    fixes.push('CREATE TABLE integrations_notion (see sql below)');
  } else {
    console.log('✅ Table exists');
  }
  
  // Check sync_state table
  console.log('\n📋 SYNC_STATE table:');
  const syncCols = await getTableColumns('sync_state');
  if (!syncCols) {
    issues.push('❌ sync_state table does not exist');
    fixes.push('CREATE TABLE sync_state (see sql below)');
  } else {
    console.log('✅ Table exists');
  }
  
  // Check if create_or_update_task RPC exists
  console.log('\n📋 RPC FUNCTIONS:');
  const { error: rpcError } = await supabase.rpc('create_or_update_task', {
    p_title: 'test',
    p_area: 'health'
  });
  
  if (rpcError && rpcError.message.includes('does not exist')) {
    issues.push('❌ create_or_update_task RPC does not exist');
    fixes.push('Run sql/create_enhanced_rpc.sql in Supabase SQL Editor');
  } else if (rpcError && rpcError.message.includes('could not be resolved')) {
    console.log('✅ RPC exists and is trying to resolve areas');
  } else {
    console.log('✅ RPC exists');
  }
  
  // Generate SQL fixes
  if (issues.length > 0) {
    console.log('\n❌ ISSUES FOUND:');
    issues.forEach(issue => console.log(`   ${issue}`));
    
    console.log('\n🔧 SQL TO RUN IN SUPABASE:');
    console.log('==========================\n');
    
    // Generate complete SQL
    const sqlStatements = [];
    
    // Add missing tables if needed
    if (issues.some(i => i.includes('tasks table does not exist'))) {
      sqlStatements.push(`
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_id UUID REFERENCES projects(id),
  milestone_id UUID REFERENCES milestones(id),
  priority TEXT,
  status TEXT,
  due_date DATE,
  focus_date DATE,
  focus_slot TEXT,
  assignee_email TEXT,
  notion_page_id TEXT,
  external_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`);
    }
    
    if (issues.some(i => i.includes('projects table does not exist'))) {
      sqlStatements.push(`
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  venture_id UUID REFERENCES ventures(id),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`);
    }
    
    if (issues.some(i => i.includes('milestones table does not exist'))) {
      sqlStatements.push(`
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_id UUID REFERENCES projects(id),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`);
    }
    
    if (issues.some(i => i.includes('integrations_notion table does not exist'))) {
      sqlStatements.push(`
CREATE TABLE IF NOT EXISTS integrations_notion (
  notion_page_id TEXT PRIMARY KEY,
  task_id UUID REFERENCES tasks(id),
  external_hash TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`);
    }
    
    if (issues.some(i => i.includes('sync_state table does not exist'))) {
      sqlStatements.push(`
CREATE TABLE IF NOT EXISTS sync_state (
  source TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ,
  cursor_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`);
    }
    
    // Add column alterations
    fixes.filter(f => f.startsWith('ALTER')).forEach(f => sqlStatements.push(f));
    
    // Add indexes
    sqlStatements.push(`
-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_tasks_notion_page ON tasks(notion_page_id);
CREATE INDEX IF NOT EXISTS idx_projects_venture ON projects(venture_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);`);
    
    // Print all SQL
    sqlStatements.forEach(sql => console.log(sql + '\n'));
    
    console.log('\n📋 THEN RUN THE RPC FUNCTION:');
    console.log('=============================');
    console.log('Copy contents of sql/create_enhanced_rpc.sql and run in SQL Editor\n');
    
  } else {
    console.log('\n✅ ALL CHECKS PASSED!');
    console.log('Your database schema is ready for the bridge.');
    console.log('\nJust need to:');
    console.log('1. Deploy the enhanced RPC (copy sql/create_enhanced_rpc.sql to SQL Editor)');
    console.log('2. Run npm run dry-run to test');
  }
}

checkSchema();
