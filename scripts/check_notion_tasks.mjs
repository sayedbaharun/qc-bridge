#!/usr/bin/env node

import { config } from 'dotenv';
import { Client } from '@notionhq/client';

config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function checkTasks() {
  try {
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID,
      page_size: 10,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
    });
    
    console.log('\n📋 Current Notion Tasks:\n' + '='.repeat(60));
    
    if (response.results.length === 0) {
      console.log('No tasks found in database');
      return;
    }
    
    let syncReady = 0;
    let skippable = 0;
    
    response.results.forEach((page, idx) => {
      const props = page.properties;
      const title = props.Task?.title?.[0]?.plain_text || 'Untitled';
      const domain = props.Domain?.select?.name || null;
      const venture = props.Venture?.select?.name || null;
      const priority = props.Priority?.select?.name || null;
      const status = props.Status?.select?.name || null;
      const project = props.Project?.rich_text?.[0]?.plain_text || null;
      const milestone = props.Milestone?.rich_text?.[0]?.plain_text || null;
      const linked = props.Linked?.checkbox || false;
      const supabaseId = props['Supabase Task ID']?.rich_text?.[0]?.plain_text || null;
      
      console.log(`\nTask ${idx + 1}: "${title}"`);
      console.log(`  Domain: ${domain || '❌ MISSING'} | Venture: ${venture || '❌ MISSING'} | Priority: ${priority || '❌ MISSING'}`);
      console.log(`  Status: ${status || '-'} | Project: ${project || '-'} | Milestone: ${milestone || '-'}`);
      console.log(`  Linked: ${linked ? '✅' : '❌'} | Supabase ID: ${supabaseId || 'none'}`);
      
      // Check if task meets requirements
      const meetsReqs = domain && venture && priority;
      if (!meetsReqs) {
        const missing = [
          !domain ? 'Domain' : null,
          !venture ? 'Venture' : null,
          !priority ? 'Priority' : null
        ].filter(Boolean);
        console.log(`  ⚠️  Will be SKIPPED - Missing: ${missing.join(', ')}`);
        skippable++;
      } else {
        console.log(`  ✅ Ready for sync`);
        syncReady++;
      }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log(`Summary: ${response.results.length} total tasks`);
    console.log(`  ✅ ${syncReady} ready for sync`);
    console.log(`  ⚠️  ${skippable} will be skipped (missing required fields)`);
    
    if (response.has_more) {
      console.log('\n(More tasks exist in database - showing most recent 10)');
    }
    
    if (syncReady === 0 && response.results.length > 0) {
      console.log('\n💡 TIP: To sync tasks, ensure they have:');
      console.log('   1. Domain (e.g., work, health, finance)');
      console.log('   2. Venture (e.g., hikma, aivant-realty)');
      console.log('   3. Priority (P1, P2, or P3)');
    }
    
  } catch (error) {
    console.error('Error querying Notion:', error.message);
    if (error.code === 'unauthorized') {
      console.error('\nCheck that NOTION_TOKEN is set correctly');
    }
    if (error.code === 'object_not_found') {
      console.error('\nCheck that NOTION_DATABASE_ID is set correctly');
    }
  }
}

checkTasks().catch(console.error);
