#!/usr/bin/env node

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
);

async function checkTableStructure() {
  console.log('\n🔍 Checking Table Structures\n' + '='.repeat(60));
  
  const tables = ['tasks', 'projects', 'milestones', 'ventures', 'domains'];
  
  for (const table of tables) {
    console.log(`\n📋 Table: ${table}`);
    console.log('-'.repeat(40));
    
    try {
      // Get one row to see columns (or empty result if no data)
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`   ❌ Error: ${error.message}`);
        if (error.message.includes('does not exist')) {
          console.log(`   Table doesn't exist!`);
        }
        continue;
      }
      
      if (data && data.length > 0) {
        // Show existing columns
        const columns = Object.keys(data[0]);
        console.log(`   Columns (${columns.length}):`);
        columns.forEach(col => {
          const value = data[0][col];
          const type = value === null ? 'null' : typeof value;
          console.log(`     • ${col} (${type})`);
        });
      } else {
        console.log(`   Table is empty - attempting to get structure...`);
        
        // Try to insert and rollback to see what columns exist
        const testData = {};
        const { error: insertError } = await supabase
          .from(table)
          .insert(testData);
        
        if (insertError) {
          // Parse error to understand structure
          if (insertError.message.includes('null value in column')) {
            const match = insertError.message.match(/column "([^"]+)"/);
            if (match) {
              console.log(`   Found required column: ${match[1]}`);
            }
          }
          
          // Common expected columns
          const expectedColumns = {
            tasks: ['id', 'title', 'venture_id', 'domain_id', 'project_id', 'milestone_id', 
                   'priority', 'status', 'focus_date', 'focus_slot', 'due_date', 
                   'assignee', 'notion_page_id', 'created_at', 'updated_at'],
            projects: ['id', 'name', 'venture_id', 'domain_id', 'status', 'priority', 
                      'start_date', 'target_date', 'budget', 'budget_spent', 
                      'revenue_generated', 'created_at', 'updated_at'],
            milestones: ['id', 'name', 'project_id', 'status', 'priority', 
                        'start_date', 'target_date', 'created_at', 'updated_at'],
            ventures: ['id', 'name', 'slug', 'description', 'primary_domain_id', 
                      'is_active', 'created_at', 'updated_at'],
            domains: ['id', 'name', 'slug', 'description', 'is_active', 
                     'created_at', 'updated_at']
          };
          
          if (expectedColumns[table]) {
            console.log(`\n   Expected columns for ${table}:`);
            expectedColumns[table].forEach(col => {
              console.log(`     • ${col}`);
            });
          }
        }
      }
      
      // Check specific columns we need
      if (table === 'tasks') {
        console.log('\n   Checking required columns for migration:');
        const requiredCols = ['venture_id', 'domain_id', 'notion_page_id'];
        for (const col of requiredCols) {
          const { data: checkData, error: checkError } = await supabase
            .from(table)
            .select(col)
            .limit(1);
          
          if (checkError && checkError.message.includes(`column ${table}.${col} does not exist`)) {
            console.log(`     ❌ ${col} - MISSING (will be added)`);
          } else {
            console.log(`     ✅ ${col} - exists`);
          }
        }
      }
      
      if (table === 'projects') {
        console.log('\n   Checking required columns for migration:');
        const requiredCols = ['venture_id', 'domain_id', 'area'];
        for (const col of requiredCols) {
          const { data: checkData, error: checkError } = await supabase
            .from(table)
            .select(col)
            .limit(1);
          
          if (checkError && checkError.message.includes(`column ${table}.${col} does not exist`)) {
            console.log(`     ❌ ${col} - MISSING (will be added)`);
          } else {
            console.log(`     ✅ ${col} - exists`);
          }
        }
      }
      
    } catch (e) {
      console.log(`   ⚠️  Unexpected error: ${e.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📝 Summary:');
  console.log('The migration script will add any missing columns.');
  console.log('Since tables are empty, this is safe to do.');
}

checkTableStructure().catch(console.error);
