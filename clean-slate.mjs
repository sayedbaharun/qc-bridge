#!/usr/bin/env node
/**
 * Clean Slate Script - Safely clear tasks data for fresh start
 * This preserves the structure but clears data for clean migration
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🧹 CLEAN SLATE - CLEARING TASKS DATA');
console.log('====================================\n');

async function confirmAction() {
  console.log('⚠️  WARNING: This will delete ALL existing data in:');
  console.log('   - tasks table');
  console.log('   - projects table'); 
  console.log('   - brands table');
  console.log('   - milestones table');
  console.log('   - sync_state table');
  console.log('   - integrations_notion table');
  console.log('');
  console.log('📋 This will preserve table structures but clear all data.');
  console.log('   You can rebuild everything from scratch with the new domain model.');
  console.log('');
  
  // Check if we're in a safe environment
  const isDryRun = process.argv.includes('--dry-run');
  const isConfirmed = process.argv.includes('--confirm');
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No data will be deleted');
    return false;
  }
  
  if (!isConfirmed) {
    console.log('❌ SAFETY CHECK: Add --confirm flag to proceed');
    console.log('   Example: npm run clean-slate -- --confirm');
    console.log('   Or for dry run: npm run clean-slate -- --dry-run');
    process.exit(1);
  }
  
  return true;
}

async function checkTableExists(tableName) {
  try {
    // Try to query the table directly - simpler approach
    const { error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);
    
    // If no error, table exists
    return !error || !error.message.includes('does not exist');
  } catch (error) {
    return false;
  }
}

async function clearTable(tableName, description) {
  console.log(`🗑️  Clearing ${tableName} (${description})...`);
  
  // Check if table exists first
  const exists = await checkTableExists(tableName);
  if (!exists) {
    console.log(`   ⚠️  Table ${tableName} does not exist - skipping`);
    return true;
  }
  
  try {
    // Try different deletion strategies based on table structure
    let success = false;
    let lastError = null;
    
    // Strategy 1: Delete using id column (most common)
    if (!success) {
      try {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (!error) {
          success = true;
        } else {
          lastError = error;
        }
      } catch (e) {
        lastError = e;
      }
    }
    
    // Strategy 2: Delete using created_at column
    if (!success) {
      try {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .gte('created_at', '1900-01-01');
        
        if (!error) {
          success = true;
        } else {
          lastError = error;
        }
      } catch (e) {
        lastError = e;
      }
    }
    
    // Strategy 3: For areas table - delete using key column
    if (!success && tableName === 'areas') {
      try {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .neq('key', 'impossible-key-value');
        
        if (!error) {
          success = true;
        } else {
          lastError = error;
        }
      } catch (e) {
        lastError = e;
      }
    }
    
    // Strategy 4: Try with name column for other tables
    if (!success) {
      try {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .neq('name', 'impossible-name-value');
        
        if (!error) {
          success = true;
        } else {
          lastError = error;
        }
      } catch (e) {
        lastError = e;
      }
    }
    
    if (!success) {
      console.error(`   ❌ Error clearing ${tableName}:`, lastError?.message || 'Unknown error');
      return false;
    }
    
    // Get count to verify
    const { count, error: countError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (!countError) {
      console.log(`   ✅ ${tableName} cleared - ${count || 0} rows remaining`);
    } else {
      console.log(`   ✅ ${tableName} cleared successfully`);
    }
    
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to clear ${tableName}:`, error.message);
    return false;
  }
}

async function resetSyncState() {
  console.log('🔄 Resetting sync state...');
  
  try {
    // Clear sync state to start fresh
    const { error } = await supabase
      .from('sync_state')
      .delete()
      .eq('source', 'notion_quick_capture');
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('   ❌ Error resetting sync state:', error.message);
      return false;
    }
    
    console.log('   ✅ Sync state reset');
    return true;
  } catch (error) {
    console.error('   ❌ Failed to reset sync state:', error.message);
    return false;
  }
}

async function main() {
  const shouldProceed = await confirmAction();
  
  if (!shouldProceed) {
    console.log('🔍 Dry run completed - no changes made');
    return;
  }
  
  console.log('🚀 Starting clean slate operation...\n');
  
  // Clear tables in dependency order (children first)
  // Updated based on actual database schema inspection
  const clearOperations = [
    { table: 'tasks', description: 'All tasks and their data' },
    { table: 'integrations_notion', description: 'Notion integration mappings' },
    { table: 'milestones', description: 'Project milestones' },
    { table: 'projects', description: 'All projects' },
    { table: 'areas', description: 'Current areas/brands' },
    { table: 'brands', description: 'Legacy brands (if exists)' }
  ];
  
  let allSuccess = true;
  
  for (const operation of clearOperations) {
    const success = await clearTable(operation.table, operation.description);
    if (!success) {
      allSuccess = false;
    }
  }
  
  // Reset sync state
  const syncSuccess = await resetSyncState();
  if (!syncSuccess) {
    allSuccess = false;
  }
  
  console.log('\n📊 CLEAN SLATE SUMMARY');
  console.log('======================');
  
  if (allSuccess) {
    console.log('✅ Clean slate completed successfully!');
    console.log('');
    console.log('🎯 Next steps:');
    console.log('1. Run: npm run setup-domains');
    console.log('2. Test with: npm run dry-run');
    console.log('3. Create first task via Notion to test new structure');
  } else {
    console.log('❌ Some operations failed - check errors above');
    console.log('   You may need to manually clean up remaining data');
  }
}

main().catch(console.error);