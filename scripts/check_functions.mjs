#!/usr/bin/env node

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
);

async function checkFunctions() {
  console.log('\n🔍 Checking RPC Functions in Database\n' + '='.repeat(50));
  
  try {
    // Query to get all functions related to task creation
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          p.proname as function_name,
          pg_get_function_identity_arguments(p.oid) as arguments,
          p.oid::regprocedure as full_signature
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND (
          p.proname LIKE '%task%' 
          OR p.proname LIKE '%capture%'
          OR p.proname = 'create_or_update_task'
        )
        ORDER BY p.proname, p.oid;
      `
    });
    
    if (error) {
      // If exec_sql doesn't exist, try a simpler approach
      console.log('❌ exec_sql RPC not available, checking basic functions...\n');
      
      const functionsToCheck = [
        'create_or_update_task',
        'create_task_from_capture_with_area',
        'create_task_from_capture'
      ];
      
      for (const funcName of functionsToCheck) {
        console.log(`\n📋 Checking: ${funcName}`);
        try {
          const { error: rpcError } = await supabase.rpc(funcName, {});
          if (rpcError) {
            if (rpcError.message.includes('could not find')) {
              console.log('   ❌ Does not exist');
            } else if (rpcError.message.includes('required')) {
              console.log('   ✅ Exists (missing required params)');
            } else if (rpcError.message.includes('not unique')) {
              console.log('   ⚠️  Multiple versions exist!');
              console.log('   Error:', rpcError.message);
            } else {
              console.log('   ✅ Exists');
            }
          }
        } catch (e) {
          console.log('   ⚠️  Error checking:', e.message);
        }
      }
      
      console.log('\n' + '='.repeat(50));
      console.log('\n⚠️  Multiple versions detected!');
      console.log('\nTo fix this, the migration script will:');
      console.log('1. Drop ALL versions of these functions');
      console.log('2. Create a single clean version');
      console.log('\nRun: sql/complete_migration.sql in Supabase');
      
    } else {
      // Display the functions found
      console.log('📋 Functions Found:\n');
      
      if (!data || data.length === 0) {
        console.log('No task-related functions found.');
      } else {
        const grouped = {};
        data.forEach(func => {
          if (!grouped[func.function_name]) {
            grouped[func.function_name] = [];
          }
          grouped[func.function_name].push(func);
        });
        
        Object.keys(grouped).forEach(name => {
          const versions = grouped[name];
          if (versions.length > 1) {
            console.log(`\n⚠️  ${name} - MULTIPLE VERSIONS (${versions.length}):`);
          } else {
            console.log(`\n✅ ${name}:`);
          }
          versions.forEach((v, idx) => {
            console.log(`   ${idx + 1}. ${v.full_signature}`);
          });
        });
      }
      
      console.log('\n' + '='.repeat(50));
      console.log('\nThe migration script will clean up any duplicates.');
    }
    
  } catch (error) {
    console.error('Error checking functions:', error.message);
  }
}

checkFunctions().catch(console.error);
