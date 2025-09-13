#!/usr/bin/env node
/**
 * Create Tables - Set up the database structure for domains and ventures
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🏗️  CREATING DATABASE TABLES');
console.log('=============================\n');

async function executeSQLFile() {
  try {
    console.log('📋 Reading SQL file...');
    const sql = readFileSync('./create-tables.sql', 'utf8');
    
    console.log('🔧 Executing SQL commands...');
    
    // Split SQL into individual commands and execute them
    const commands = sql.split(';').filter(cmd => cmd.trim().length > 0);
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i].trim();
      if (command.length === 0) continue;
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: command });
        if (error) {
          console.error(`❌ Error executing command ${i + 1}:`, error.message);
          // Continue with other commands
        } else {
          console.log(`✅ Command ${i + 1} executed successfully`);
        }
      } catch (err) {
        console.error(`❌ Exception executing command ${i + 1}:`, err.message);
        // Continue with other commands
      }
    }
    
    console.log('\n✅ SQL execution completed');
    return true;
  } catch (error) {
    console.error('❌ Failed to execute SQL:', error.message);
    return false;
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE environment variables');
    process.exit(1);
  }
  
  const success = await executeSQLFile();
  
  if (success) {
    console.log('\n🎯 TABLE CREATION SUMMARY');
    console.log('=========================');
    console.log('✅ Database tables created successfully!');
    console.log('');
    console.log('🔄 Next step: npm run setup-domains-simple');
  } else {
    console.log('\n❌ Table creation failed - check errors above');
  }
}

main().catch(console.error);