#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log(JSON.stringify({ ok: false, error: 'Missing SUPABASE_URL or key' }, null, 2));
  process.exit(1);
}

const supabase = createClient(url, key);

async function tableExists(name) {
  try {
    const { error } = await supabase.from(name).select('*').limit(1);
    if (error && (error.message || '').toLowerCase().includes('does not exist')) return false;
    return true;
  } catch (e) {
    return false;
  }
}

async function rpcExists(name) {
  try {
    // exec_sql expects sql_query param; others can be called with empty/default params
    if (name === 'exec_sql') {
      const { error } = await supabase.rpc('exec_sql', { sql_query: 'SELECT 1' });
      return !error || !((error.message || '').toLowerCase().includes('not exist'));
    }
    const { error } = await supabase.rpc(name, {});
    // If it errors because of missing params, it still proves the function exists
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('not exist') || msg.includes('unknown function') || msg.includes('function') && msg.includes('does not exist')) return false;
      return true;
    }
    return true;
  } catch (e) {
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('does not exist') || msg.includes('unknown function')) return false;
    return true;
  }
}

(async () => {
  const hasExecSql = await rpcExists('exec_sql');
  const hasCreateOrUpdateTask = await rpcExists('create_or_update_task');
  const hasDomains = await tableExists('domains');
  const hasVentures = await tableExists('ventures');
  const hasProjects = await tableExists('projects');
  const hasMilestones = await tableExists('milestones');
  const hasTasks = await tableExists('tasks');

  const summary = {
    ok: true,
    rpcs: {
      exec_sql: hasExecSql,
      create_or_update_task: hasCreateOrUpdateTask
    },
    tables: {
      domains: hasDomains,
      ventures: hasVentures,
      projects: hasProjects,
      milestones: hasMilestones,
      tasks: hasTasks
    }
  };
  console.log(JSON.stringify(summary, null, 2));
})();
