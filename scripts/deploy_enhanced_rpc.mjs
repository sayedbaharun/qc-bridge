#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🚀 Deploying Enhanced RPC Function');
console.log('===================================\n');

async function deployRPC() {
  try {
    // Read the SQL file
    const sqlPath = join(__dirname, '..', 'sql', 'create_enhanced_rpc.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    
    console.log('📋 SQL function loaded');
    console.log('🔧 Deploying to Supabase...');
    
    // Note: Since exec_sql doesn't exist, we need to use Supabase Dashboard
    // or create the function via their SQL editor
    console.log('\n⚠️  MANUAL STEP REQUIRED:');
    console.log('================================');
    console.log('Copy the contents of sql/create_enhanced_rpc.sql');
    console.log('and run it in your Supabase SQL Editor');
    console.log('\nThe function will:');
    console.log('✅ Resolve Notion area names to domains/ventures');
    console.log('✅ Create projects under the correct venture');
    console.log('✅ Create milestones under projects');
    console.log('✅ Create/update tasks with proper hierarchy');
    console.log('✅ Update integrations_notion for sync tracking');
    
    // Test if the function exists
    console.log('\n🔍 Testing if function already exists...');
    const { data, error } = await supabase.rpc('create_or_update_task', {
      p_title: 'Test',
      p_area: 'health'
    }).single();
    
    if (error) {
      if (error.message.includes('could not be resolved')) {
        console.log('✅ Function exists and is working!');
      } else if (error.message.includes('does not exist')) {
        console.log('❌ Function does not exist yet - please deploy via SQL Editor');
      } else {
        console.log('⚠️  Function exists but may need updating');
        console.log('   Error:', error.message);
      }
    } else {
      console.log('✅ Function exists and created test task!');
      console.log('   Task ID:', data?.task_id);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

deployRPC();
