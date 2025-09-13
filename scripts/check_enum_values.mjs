#!/usr/bin/env node

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
);

async function checkEnumValues() {
  console.log('\n🔍 Checking ENUM Types in Database\n' + '='.repeat(60));
  
  // Try to get enum values using a test insert
  console.log('\n📋 Testing milestone status values:');
  
  // Test different status values
  const testValues = [
    'Active',
    '🟡 Active',
    'planned',
    'in_progress', 
    'completed',
    'on_hold',
    'To do',
    'In Progress',
    'Done'
  ];
  
  for (const status of testValues) {
    try {
      const { error } = await supabase
        .from('milestones')
        .insert({
          name: 'test',
          project_id: '00000000-0000-0000-0000-000000000000',
          status: status
        });
      
      if (error) {
        if (error.message.includes('invalid input value for enum')) {
          console.log(`   ❌ '${status}' - NOT VALID`);
        } else if (error.message.includes('violates foreign key')) {
          console.log(`   ✅ '${status}' - VALID (FK error means status was accepted)`);
        } else {
          console.log(`   ⚠️  '${status}' - Other error: ${error.message.substring(0, 50)}...`);
        }
      } else {
        console.log(`   ✅ '${status}' - VALID`);
      }
    } catch (e) {
      console.log(`   ⚠️  '${status}' - Error: ${e.message}`);
    }
  }
  
  // Try similar for projects
  console.log('\n📋 Testing project status values:');
  
  for (const status of testValues) {
    try {
      const { error } = await supabase
        .from('projects')
        .insert({
          name: 'test',
          venture_id: '00000000-0000-0000-0000-000000000000',
          status: status
        });
      
      if (error) {
        if (error.message.includes('invalid input value for enum')) {
          console.log(`   ❌ '${status}' - NOT VALID`);
        } else if (error.message.includes('violates foreign key')) {
          console.log(`   ✅ '${status}' - VALID (FK error means status was accepted)`);
        } else {
          console.log(`   ⚠️  '${status}' - Other error: ${error.message.substring(0, 50)}...`);
        }
      }
    } catch (e) {
      console.log(`   ⚠️  '${status}' - Error: ${e.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\nBased on the errors, we can determine the valid enum values.');
  console.log('The migration should use these valid values instead of emojis.');
}

checkEnumValues().catch(console.error);
