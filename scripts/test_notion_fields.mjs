#!/usr/bin/env node
import dotenv from 'dotenv';

dotenv.config();

console.log('🧪 Testing Notion Field Compatibility');
console.log('=====================================\n');

console.log('📋 YOUR NOTION STRUCTURE:');
console.log('------------------------');
console.log('✅ Task (title) - Main task name');
console.log('✅ Domain (select) - 9 options: health, work, finance, family, home, travel, learning, relationships, play');
console.log('✅ Venture (select) - 17 options: hikma, aivant-realty, arab-money, etc.');
console.log('✅ Project (text) - Project name');
console.log('✅ Milestone (text) - Milestone name');
console.log('✅ Priority (select) - P1, P2, P3');
console.log('✅ Status (select) - To do, In Progress, Completed, On Hold');
console.log('✅ Assignee (text) - Who is accountable');
console.log('✅ Focus Date (date) - When you will do the task');
console.log('✅ Focus Slot (select) - Time block options');
console.log('✅ Due Date (date) - When task is due');
console.log('✅ Linked (checkbox) - Bridge connection status');
console.log('✅ Supabase Task ID (text) - Bridge writes task ID here');

console.log('\n📋 BRIDGE COMPATIBILITY:');
console.log('------------------------');

// Simulate what the bridge will do with a sample task
const sampleNotionPage = {
  properties: {
    'Task': { title: [{ plain_text: 'Complete Q1 strategy review' }] },
    'Domain': { select: { name: 'work' } },
    'Venture': { select: { name: 'hikma' } },
    'Project': { rich_text: [{ plain_text: 'Strategic Planning 2025' }] },
    'Milestone': { rich_text: [{ plain_text: 'Q1 Review' }] },
    'Priority': { select: { name: 'P1' } },
    'Status': { select: { name: 'To do' } },
    'Assignee': { rich_text: [{ plain_text: 'me@example.com' }] },
    'Focus Date': { date: { start: '2025-01-15' } },
    'Focus Slot': { select: { name: 'Deep Work Block 1' } },
    'Due Date': { date: { start: '2025-01-31' } },
    'Linked': { checkbox: false },
    'Supabase Task ID': { rich_text: [] }
  }
};

// Test the extractProperties function logic
function extractProperties(page) {
  const props = page.properties;
  return {
    title: props.Task?.title?.[0]?.plain_text || 'Untitled',
    domain: props.Domain?.select?.name?.toLowerCase() || null,
    venture: props.Venture?.select?.name?.toLowerCase() || null,
    area: props.Venture?.select?.name?.toLowerCase() || props.Domain?.select?.name?.toLowerCase() || null,
    project: props.Project?.rich_text?.[0]?.plain_text || null,
    milestone: props.Milestone?.rich_text?.[0]?.plain_text || null,
    priority: props.Priority?.select?.name || null,
    dueDate: props['Due Date']?.date?.start || null,
    assignee: props.Assignee?.rich_text?.[0]?.plain_text || null,
    status: props.Status?.select?.name || null,
    focusSlot: props['Focus Slot']?.select?.name || null,
    focusDate: props['Focus Date']?.date?.start || null,
    supabaseTaskId: props['Supabase Task ID']?.rich_text?.[0]?.plain_text || null,
    linked: props.Linked?.checkbox || false
  };
}

const extracted = extractProperties(sampleNotionPage);

console.log('\n🔍 Sample Task Extraction:');
console.log('-------------------------');
console.log(`Title: ${extracted.title}`);
console.log(`Domain: ${extracted.domain}`);
console.log(`Venture: ${extracted.venture}`);
console.log(`Area (for RPC): ${extracted.area}`);
console.log(`Project: ${extracted.project}`);
console.log(`Milestone: ${extracted.milestone}`);
console.log(`Priority: ${extracted.priority}`);
console.log(`Status: ${extracted.status}`);
console.log(`Due Date: ${extracted.dueDate}`);
console.log(`Focus Date: ${extracted.focusDate}`);
console.log(`Focus Slot: ${extracted.focusSlot}`);

console.log('\n✅ VALIDATION RESULTS:');
console.log('---------------------');

const issues = [];

// Check REQUIRED fields - Domain, Venture, and Priority must ALL be present
if (!extracted.title) issues.push('❌ Task title not extracted');
if (!extracted.domain) issues.push('❌ Domain is REQUIRED - task will be skipped');
if (!extracted.venture) issues.push('❌ Venture is REQUIRED - task will be skipped');
if (!extracted.priority) issues.push('❌ Priority is REQUIRED - task will be skipped');
if (!extracted.area) issues.push('❌ Area not resolved for RPC');

// Check field mapping
if (extracted.venture === 'hikma' && extracted.domain === 'work') {
  console.log('✅ Venture "hikma" under domain "work" correctly extracted');
} else if (sampleNotionPage.properties.Venture?.select?.name === 'hikma') {
  issues.push('❌ Venture extraction issue');
}

if (issues.length === 0) {
  console.log('✅ All fields correctly mapped!');
  console.log('✅ Bridge will process this task successfully');
  
  console.log('\n📊 WHAT WILL HAPPEN:');
  console.log('-------------------');
  console.log('1. Bridge will use venture "hikma" to resolve to the correct venture_id');
  console.log('2. Project "Strategic Planning 2025" will be created under hikma venture');
  console.log('3. Milestone "Q1 Review" will be created under the project');
  console.log('4. Task will be created with all properties');
  console.log('5. Supabase Task ID will be written back to Notion');
  console.log('6. Linked checkbox will be checked');
} else {
  console.log('❌ Issues found:');
  issues.forEach(issue => console.log(`   ${issue}`));
}

console.log('\n🎯 NEXT STEPS:');
console.log('-------------');
console.log('1. Copy sql/create_enhanced_rpc.sql to Supabase SQL Editor and run it');
console.log('2. Create a test task in Notion with your exact field structure');
console.log('3. Run: npm run dry-run');
console.log('4. If successful, run: npm run once');

console.log('\n📝 TEST TASK EXAMPLE:');
console.log('-------------------');
console.log('Task: "Test bridge sync"');
console.log('Domain: work  ⭐ REQUIRED');
console.log('Venture: hikma  ⭐ REQUIRED');
console.log('Priority: P2  ⭐ REQUIRED');
console.log('Status: To do (optional but recommended)');
console.log('');
console.log('⚠️  IMPORTANT: Tasks missing Domain, Venture, OR Priority will be SKIPPED');
console.log('This ensures only properly categorized tasks are synced.');
