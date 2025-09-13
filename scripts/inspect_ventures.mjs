#!/usr/bin/env node

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
);

async function inspectVentures() {
  console.log('\n🔍 Inspecting ventures table:\n' + '='.repeat(50));
  
  // First, try to get all ventures with minimal columns
  const { data: ventures, error } = await supabase
    .from('ventures')
    .select('*')
    .limit(25);
    
  if (error) {
    console.error('Error fetching ventures:', error);
    return;
  }
  
  if (!ventures || ventures.length === 0) {
    console.log('No ventures found in table');
    return;
  }
  
  // Show structure from first venture
  console.log('\n📋 Venture Table Structure (from first row):');
  const firstVenture = ventures[0];
  Object.keys(firstVenture).forEach(key => {
    const value = firstVenture[key];
    const type = value === null ? 'null' : typeof value;
    console.log(`  ${key}: ${type}`);
  });
  
  // List all ventures
  console.log('\n📋 All Ventures (' + ventures.length + ' total):');
  ventures.forEach((v, idx) => {
    console.log(`\n${idx + 1}. ${v.name || 'unnamed'}`);
    // Show all fields for first few
    if (idx < 3) {
      Object.entries(v).forEach(([key, value]) => {
        if (key !== 'name') {
          console.log(`   ${key}: ${JSON.stringify(value)}`);
        }
      });
    }
  });
  
  // Check if 'investments' exists
  const hasInvestments = ventures.some(v => 
    v.name && v.name.toLowerCase() === 'investments'
  );
  
  console.log('\n' + '='.repeat(50));
  if (hasInvestments) {
    console.log('✅ "investments" venture already exists');
    const inv = ventures.find(v => v.name && v.name.toLowerCase() === 'investments');
    console.log('Details:', JSON.stringify(inv, null, 2));
  } else {
    console.log('⚠️  "investments" venture not found');
    console.log('\nVenture names found:');
    ventures.forEach(v => {
      if (v.name) console.log(`  - ${v.name}`);
    });
  }
}

inspectVentures().catch(console.error);
