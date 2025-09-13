#!/usr/bin/env node

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
);

async function checkProjectsTable() {
  console.log('\n🔍 Checking projects table structure:\n' + '='.repeat(50));
  
  // Try to get one project to see its structure
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error('Error fetching projects:', error);
    return;
  }
  
  if (!projects || projects.length === 0) {
    console.log('No projects found - inserting test project to check structure...');
    
    // Try minimal insert to see what columns exist
    const { data: testProject, error: insertError } = await supabase
      .from('projects')
      .insert({
        name: 'test-project-structure',
        venture_id: '15a0cdc6-a26e-4203-b908-1c07df433e1d' // investments venture
      })
      .select()
      .single();
      
    if (insertError) {
      console.error('Error inserting test project:', insertError);
      console.log('\nThis error reveals required columns.');
      return;
    }
    
    console.log('\n📋 Projects table structure (from test insert):');
    Object.keys(testProject).forEach(key => {
      const value = testProject[key];
      const type = value === null ? 'null' : typeof value;
      console.log(`  ${key}: ${type}`);
    });
    
    // Clean up test project
    await supabase.from('projects').delete().eq('id', testProject.id);
    console.log('\n(Test project cleaned up)');
    
  } else {
    console.log('\n📋 Projects table structure (from existing row):');
    const firstProject = projects[0];
    Object.keys(firstProject).forEach(key => {
      const value = firstProject[key];
      const type = value === null ? 'null' : typeof value;
      console.log(`  ${key}: ${type}`);
    });
  }
}

checkProjectsTable().catch(console.error);
