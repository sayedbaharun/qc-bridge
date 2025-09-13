#!/usr/bin/env node

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
);

async function analyzeDependencies() {
  console.log('\n🔍 ANALYZING DATABASE STRUCTURE AND DEPENDENCIES\n' + '='.repeat(60));
  
  // 1. Get all views that depend on the area column
  console.log('\n📊 VIEWS DEPENDENT ON AREA COLUMN:');
  console.log('-----------------------------------');
  const viewsToCheck = [
    'focus_today',
    'business_focus', 
    'personal_focus',
    'area_overview',
    'today_time_blocks',
    'needs_time_blocking',
    'daily_schedule',
    'needs_scheduling',
    'project_progress',
    'project_status',
    'area_finance_totals',
    'finance_roi'
  ];
  
  for (const viewName of viewsToCheck) {
    console.log(`\n📋 View: ${viewName}`);
    try {
      const { data, error } = await supabase.from(viewName).select('*').limit(1);
      if (!error) {
        console.log(`   ✅ Exists and accessible`);
        if (data && data.length > 0) {
          console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`);
        }
      } else {
        console.log(`   ❌ Error: ${error.message}`);
      }
    } catch (e) {
      console.log(`   ⚠️  Could not access`);
    }
  }
  
  // 2. Check table structures
  console.log('\n\n📊 TABLE STRUCTURES:');
  console.log('--------------------');
  
  const tables = ['domains', 'ventures', 'projects', 'milestones', 'tasks', 'areas'];
  
  for (const table of tables) {
    console.log(`\n📋 Table: ${table}`);
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (!error) {
        if (data && data.length > 0) {
          console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`);
          
          // Check for area-related columns
          const hasArea = Object.keys(data[0]).includes('area');
          const hasAreaId = Object.keys(data[0]).includes('area_id');
          const hasDomainId = Object.keys(data[0]).includes('domain_id');
          const hasVentureId = Object.keys(data[0]).includes('venture_id');
          
          console.log(`   Has 'area' column: ${hasArea}`);
          console.log(`   Has 'area_id' column: ${hasAreaId}`);
          console.log(`   Has 'domain_id' column: ${hasDomainId}`);
          console.log(`   Has 'venture_id' column: ${hasVentureId}`);
        } else {
          console.log(`   Empty table`);
        }
      } else {
        console.log(`   ❌ Error: ${error.message}`);
      }
    } catch (e) {
      console.log(`   ⚠️  Could not access`);
    }
  }
  
  // 3. Check RPC functions
  console.log('\n\n📊 RPC FUNCTIONS:');
  console.log('-----------------');
  
  const rpcs = ['create_or_update_task', 'exec_sql'];
  
  for (const rpc of rpcs) {
    console.log(`\n📋 RPC: ${rpc}`);
    try {
      // Test with minimal params to see if it exists
      const { error } = await supabase.rpc(rpc, {});
      if (error) {
        if (error.message.includes('Could not find')) {
          console.log(`   ❌ Does not exist`);
        } else if (error.message.includes('required')) {
          console.log(`   ✅ Exists (missing required params)`);
        } else if (error.message.includes('candidate')) {
          console.log(`   ⚠️  Multiple versions exist (conflict)`);
        } else {
          console.log(`   ✅ Exists`);
        }
      } else {
        console.log(`   ✅ Exists and callable`);
      }
    } catch (e) {
      console.log(`   ⚠️  Error checking: ${e.message}`);
    }
  }
  
  // 4. Analyze relationships
  console.log('\n\n📊 RELATIONSHIP ANALYSIS:');
  console.log('-------------------------');
  
  // Check how areas table is used
  const { data: areasData } = await supabase.from('areas').select('*').limit(5);
  if (areasData && areasData.length > 0) {
    console.log('\n📋 Areas table sample:');
    areasData.forEach(area => {
      console.log(`   - ${area.name || area.id}`);
    });
  }
  
  // Check ventures-domains relationship
  const { data: venturesData } = await supabase
    .from('ventures')
    .select('name, primary_domain_id')
    .limit(5);
    
  if (venturesData && venturesData.length > 0) {
    console.log('\n📋 Ventures-Domains relationship:');
    for (const venture of venturesData) {
      const { data: domain } = await supabase
        .from('domains')
        .select('name')
        .eq('id', venture.primary_domain_id)
        .single();
      console.log(`   ${venture.name} -> ${domain?.name || 'unknown'}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Analysis complete! Check the results above.');
}

analyzeDependencies().catch(console.error);
