#!/usr/bin/env node

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
);

async function checkAndAddInvestments() {
  console.log('\n🔍 Checking ventures in Supabase:\n' + '='.repeat(50));
  
  // Get all ventures
  const { data: ventures, error } = await supabase
    .from('ventures')
    .select('id, name, domain_id, domains(name)')
    .order('name');
    
  if (error) {
    console.error('Error fetching ventures:', error);
    return;
  }
  
  console.log('\n📋 Current Ventures:');
  const byDomain = {};
  ventures.forEach(v => {
    const domain = v.domains?.name || 'unknown';
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(v.name);
  });
  
  Object.keys(byDomain).sort().forEach(domain => {
    console.log(`\n  ${domain}:`);
    byDomain[domain].forEach(venture => {
      console.log(`    - ${venture}`);
    });
  });
  
  // Check if 'investments' exists
  const hasInvestments = ventures.some(v => v.name.toLowerCase() === 'investments');
  
  if (hasInvestments) {
    console.log('\n✅ "investments" venture already exists');
  } else {
    console.log('\n⚠️  "investments" venture not found');
    
    // Find finance domain
    const { data: domains } = await supabase
      .from('domains')
      .select('id, name')
      .eq('name', 'finance')
      .single();
    
    if (!domains) {
      console.error('Finance domain not found!');
      return;
    }
    
    console.log('\n📝 Adding "investments" venture under finance domain...');
    
    const { data: newVenture, error: insertError } = await supabase
      .from('ventures')
      .insert({
        name: 'investments',
        domain_id: domains.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('Error adding venture:', insertError);
    } else {
      console.log('✅ Successfully added "investments" venture!');
      console.log('   ID:', newVenture.id);
      console.log('   Name:', newVenture.name);
      console.log('   Domain:', 'finance');
    }
  }
  
  // Also check Notion field options
  console.log('\n📝 Note: Make sure "investments" is also added to your Notion database:');
  console.log('   1. Open your Notion Quick Capture database');
  console.log('   2. Click on the Venture property');
  console.log('   3. Add "investments" as an option if not already there');
  console.log('   4. Update your test task to use "investments" as the Venture');
}

checkAndAddInvestments().catch(console.error);
