#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
);

console.log('🔍 Checking focus_slot values and constraints\n');
console.log('='.repeat(50));

// First, let's check what focus_slot values exist in the database
async function checkExistingValues() {
  console.log('\n📊 Existing focus_slot values in tasks table:');
  const { data, error } = await supabase
    .from('tasks')
    .select('focus_slot')
    .not('focus_slot', 'is', null)
    .limit(20);
  
  if (error) {
    console.error('Error fetching existing values:', error.message);
  } else if (data && data.length > 0) {
    const uniqueValues = [...new Set(data.map(t => t.focus_slot))];
    uniqueValues.forEach(val => console.log(`  - "${val}"`));
  } else {
    console.log('  No focus_slot values found in existing tasks');
  }
}

// Check the time_slots table which might define valid values
async function checkTimeSlotsTable() {
  console.log('\n📋 Checking time_slots table for valid values:');
  const { data, error } = await supabase
    .from('time_slots')
    .select('*')
    .order('slot');
  
  if (error) {
    console.error('Error fetching time_slots:', error.message);
  } else if (data) {
    console.log('Valid time slots:');
    data.forEach(slot => {
      console.log(`  - ID: ${slot.id}, Slot: "${slot.slot}", Time: ${slot.start_time || 'N/A'}`);
    });
  }
}

// Try to get constraint definition via raw SQL
async function checkConstraintDefinition() {
  console.log('\n🔧 Checking constraint definition:');
  
  // Try to query pg_constraint to get the actual constraint
  const { data, error } = await supabase.rpc('get_constraint_def', {
    constraint_name: 'tasks_focus_slot_check'
  }).catch(async () => {
    // If the RPC doesn't exist, try a direct query
    console.log('  (RPC not found, checking via direct query)');
    return { data: null, error: 'RPC not available' };
  });
  
  if (data) {
    console.log('Constraint definition:', data);
  } else {
    console.log('  Could not retrieve constraint definition directly');
  }
}

// Test what happens with different values
async function testValues() {
  console.log('\n🧪 Testing different focus_slot values:');
  
  const testValues = [
    'Admin Block 2',
    'Admin Block',
    'Deep Work',
    'Morning',
    'Afternoon',
    null,
    ''
  ];
  
  for (const value of testValues) {
    // We'll just check what the constraint would do, not actually insert
    console.log(`\n  Testing: "${value}"`);
    
    // Check if this value exists in time_slots
    if (value) {
      const { data, error } = await supabase
        .from('time_slots')
        .select('id')
        .eq('slot', value)
        .single();
      
      if (data) {
        console.log(`    ✅ Found in time_slots table (id: ${data.id})`);
      } else if (error?.code === 'PGRST116') {
        console.log(`    ❌ NOT found in time_slots table`);
      } else if (error) {
        console.log(`    ⚠️ Error checking: ${error.message}`);
      }
    } else {
      console.log(`    ⓘ NULL or empty value`);
    }
  }
}

// Main execution
async function main() {
  try {
    await checkExistingValues();
    await checkTimeSlotsTable();
    await checkConstraintDefinition();
    await testValues();
    
    console.log('\n' + '='.repeat(50));
    console.log('\n💡 SOLUTION:');
    console.log('The focus_slot value must either be:');
    console.log('  1. NULL (no focus slot selected)');
    console.log('  2. A valid value that exists in the time_slots table');
    console.log('\nThe error "Admin Block 2" suggests this value doesn\'t exist in time_slots.');
    console.log('You need to either:');
    console.log('  a) Add "Admin Block 2" to the time_slots table, OR');
    console.log('  b) Map it to a valid time_slot value, OR');
    console.log('  c) Set it to NULL if no valid mapping exists');
    
  } catch (error) {
    console.error('Error in main:', error);
  }
}

main();
