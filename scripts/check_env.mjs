#!/usr/bin/env node
import dotenv from 'dotenv';

dotenv.config();

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE'
];

const optionalNow = [
  // Not required for Supabase setup phase; needed for bridge later
  'NOTION_TOKEN',
  'NOTION_DATABASE_ID'
];

const missing = required.filter((k) => !process.env[k]);
const summary = {
  ok: missing.length === 0,
  missing,
  optional_present: optionalNow.filter((k) => !!process.env[k])
};

console.log(JSON.stringify(summary, null, 2));

process.exit(summary.ok ? 0 : 1);
