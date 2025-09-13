#!/usr/bin/env node

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
);

async function testRPC() {
  console.log('\n🧪 Testing create_or_update_task RPC directly\n' + '='.repeat(50));
  
  const testData = {
    p_title: 'Test RPC Task',
    p_area: 'investments',
    p_project_name: 'Test Project',
    p_milestone_name: null,
    p_priority: 'P2',
    p_status: 'To do',
    p_due_date: null,
    p_assignee: null,
    p_notion_page_id: 'test-' + Date.now(),
    p_focus_date: null,
    p_focus_slot: null
  };
  
  console.log('📝 Test Parameters:');
  console.log('  Title:', testData.p_title);
  console.log('  Area/Venture:', testData.p_area);
  console.log('  Project:', testData.p_project_name);
  console.log('  Priority:', testData.p_priority);
  console.log('  Notion ID:', testData.p_notion_page_id);
  
  console.log('\n🚀 Calling RPC...');
  
  const { data, error } = await supabase.rpc('create_or_update_task', testData);
  
  if (error) {
    console.error('\n❌ RPC Error:', error.message);
    console.error('Error Code:', error.code);
    console.error('Error Details:', error.details);
    console.error('Error Hint:', error.hint);
    
    // Check what the error reveals about the function
    if (error.message.includes('column') && error.message.includes('does not exist')) {
      console.log('\n⚠️  The RPC function is trying to access a column that doesn\'t exist.');
      console.log('This means the old RPC function is still active.');
      console.log('\n📝 Please update the RPC function in Supabase:');
      console.log('1. Go to Supabase SQL Editor');
      console.log('2. Run the SQL from: sql/create_fixed_rpc.sql');
    }
  } else {
    console.log('\n✅ RPC Success!');
    console.log('Result:', JSON.stringify(data, null, 2));
    
    // Clean up test task if created
    if (data?.task_id) {
      console.log('\n🧹 Cleaning up test task...');
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .eq('id', data.task_id);
      
      if (!deleteError) {
        console.log('✅ Test task cleaned up');
      }
    }
  }
}

testRPC().catch(console.error);
