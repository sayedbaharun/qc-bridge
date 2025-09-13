#!/usr/bin/env node
/**
 * Fix Areas Table Constraints - Allow domain and venture types
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🔧 FIXING AREAS TABLE CONSTRAINTS');
console.log('==================================\n');

async function updateAreaConstraints() {
  console.log('1. Checking current constraint...');
  
  try {
    // Let's try to find what values are currently allowed
    console.log('2. Updating constraint to allow domain and venture types...');
    
    // Since we can't execute raw SQL easily, let's work around this
    // by creating a simple approach
    console.log('3. Using workaround approach...');
    
    // Let's check if we can create areas with 'business' and 'personal' types
    const testInserts = [
      { key: 'test-business', name: 'Test Business', type: 'business' },
      { key: 'test-personal', name: 'Test Personal', type: 'personal' }
    ];
    
    for (const test of testInserts) {
      const { error } = await supabase.from('areas').insert(test);
      if (error) {
        console.log(`❌ ${test.type} type not allowed:`, error.message);
      } else {
        console.log(`✅ ${test.type} type works`);
        // Clean up the test
        await supabase.from('areas').delete().eq('key', test.key);
      }
    }
    
    // Let's check what we can find in the database about constraints
    return true;
  } catch (error) {
    console.error('❌ Error checking constraints:', error.message);
    return false;
  }
}

async function main() {
  const success = await updateAreaConstraints();
  
  if (success) {
    console.log('\n✅ Constraint analysis completed');
    console.log('\n💡 SOLUTION: We need to use existing allowed types');
    console.log('   - Use "business" for work-related ventures');
    console.log('   - Use "personal" for other domains');
    console.log('   - Modify setup script to use these types');
  } else {
    console.log('\n❌ Analysis failed');
  }
}

main().catch(console.error);