#!/usr/bin/env node
/**
 * Database Schema Inspector - Check what tables exist
 * Run this to see your current database structure
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🔍 DATABASE SCHEMA INSPECTION');
console.log('=============================\n');

async function inspectTables() {
  try {
    const { data: tables, error } = await supabase
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public')
      .order('table_name');
    
    if (error) {
      console.error('❌ Error fetching tables:', error.message);
      return;
    }
    
    console.log('📋 EXISTING TABLES:');
    console.log('==================\n');
    
    for (const table of tables) {
      console.log(`📊 ${table.table_name} (${table.table_type})`);
      
      // Get column info
      const { data: columns, error: colError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_schema', 'public')
        .eq('table_name', table.table_name)
        .order('ordinal_position');
      
      if (!colError && columns) {
        columns.forEach(col => {
          const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(not null)';
          const defaultVal = col.column_default ? ` default: ${col.column_default}` : '';
          console.log(`   - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
        });
        
        // Get row count
        const { count, error: countError } = await supabase
          .from(table.table_name)
          .select('*', { count: 'exact', head: true });
          
        if (!countError) {
          console.log(`   📊 Rows: ${count || 0}`);
        }
      }
      console.log('');
    }
    
    return tables;
  } catch (error) {
    console.error('❌ Inspection failed:', error.message);
    return [];
  }
}

async function checkSpecificTables() {
  const expectedTables = ['tasks', 'projects', 'brands', 'milestones', 'sync_state', 'integrations_notion'];
  
  console.log('🎯 EXPECTED TABLES CHECK:');
  console.log('=========================\n');
  
  for (const tableName of expectedTables) {
    try {
      const { data, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_name', tableName)
        .single();
      
      if (!error && data) {
        console.log(`✅ ${tableName} - EXISTS`);
        
        // Try to get count
        const { count, error: countError } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });
          
        if (!countError) {
          console.log(`   📊 ${count || 0} rows`);
        } else {
          console.log(`   ❌ Error counting: ${countError.message}`);
        }
      } else {
        console.log(`❌ ${tableName} - MISSING`);
      }
    } catch (error) {
      console.log(`❌ ${tableName} - ERROR: ${error.message}`);
    }
  }
}

async function suggestCleanSlateApproach() {
  console.log('\n💡 CLEAN SLATE RECOMMENDATIONS:');
  console.log('===============================\n');
  
  // Check what tables exist and have data
  const tablesWithData = [];
  const expectedTables = ['tasks', 'projects', 'brands', 'milestones', 'sync_state', 'integrations_notion', 'areas'];
  
  for (const tableName of expectedTables) {
    try {
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
        
      if (!error && count > 0) {
        tablesWithData.push({ table: tableName, count });
      }
    } catch (error) {
      // Table doesn't exist or can't be accessed
    }
  }
  
  if (tablesWithData.length === 0) {
    console.log('✅ Database appears to be clean already!');
    console.log('   You can proceed directly with: npm run setup-domains');
  } else {
    console.log('📋 Tables with data that should be cleared:');
    tablesWithData.forEach(({ table, count }) => {
      console.log(`   - ${table}: ${count} rows`);
    });
    
    console.log('\n🛠️  Recommended approach:');
    console.log('1. Update clean-slate.mjs to only target existing tables');
    console.log('2. Run: npm run clean-slate -- --dry-run');
    console.log('3. When satisfied: npm run clean-slate -- --confirm');
    console.log('4. Then: npm run setup-domains');
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE environment variables');
    process.exit(1);
  }
  
  await inspectTables();
  await checkSpecificTables();
  await suggestCleanSlateApproach();
}

main().catch(console.error);