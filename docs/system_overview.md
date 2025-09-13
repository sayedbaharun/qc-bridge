# QC Bridge — System Overview

This document describes the architecture and operating model of the Notion ⇄ Supabase bridge, including normalization rules, database constraints, sync flow, and troubleshooting tips.

## High-level goals
- Author and manage tasks primarily in Notion.
- Mirror tasks into Supabase for analytics, calculations, and dashboards.
- Keep both sides consistent with a deterministic, idempotent sync process.
- Prefer on-demand syncs during development; move to cron later if/when needed.

## Key commands
- One-off sync (recommended):
  - npm run sync:once (wrapper: logs each run, prevents overlap)
  - Under the hood calls npm run once which runs node index.mjs --once --verbose
- Dry run (no writes): npm run dry-run
- Long running / server mode: npm run server (health endpoint) or npm run dev for verbose loop

## Core entities and fields
- tasks
  - id (uuid) — primary key in Supabase
  - notion_id (text) — Notion page ID
  - title (text)
  - status (text) — normalized to canonical set; DB check enforces allowed values
  - priority (text) — one of P0/P1/P2/P3 (or your preferred set)
  - focus_slot (text) — normalized to canonical set; DB check enforces allowed values
  - due_date (date or timestamptz)
  - project_id, milestone_id (uuid) — nullable FKs depending on your schema
  - hash (text) — deterministic content hash used for sync idempotency
  - created_at, updated_at (timestamptz) — audit fields

- ops_logs (append-only operational logs)
  - id (uuid), entity_id (uuid/text), entity_type (text), operation (text)
  - metadata (jsonb), created_by (text), created_at (timestamptz)

Note: Column names may vary slightly depending on your migrations; the above reflects the current working shape.

## Normalization rules (canonical values)
Normalization happens in the Node sync before inserts/updates and when computing hashes so that equivalent user inputs do not trigger false change detection.

- Status (examples):
  - To do / To Do / Todo → 📝 To Do
  - In Progress / Doing → 🚧 In Progress
  - Blocked → ⛔ Blocked
  - Done / Completed → ✅ Done
  - Archived → 📦 Archived

- Focus slot (examples; use the emoji variants as canonical):
  - Deep Work 1 → 🧠 Deep Work 1
  - Deep Work 2 → 🧠 Deep Work 2
  - Admin Block 1 → 📋 Admin Block 1
  - Admin Block 2 → 📋 Admin Block 2
  - Meetings → 🤝 Meetings
  - Buffer → ⏳ Buffer

Tip: The database check constraints have been relaxed to accept both emoji and non-emoji variants for backward compatibility, but the sync writes and hashing use the emoji canonical forms to keep state consistent.

## Database constraints and migrations
- tasks_status_check and tasks_focus_slot_check enforce allowed value sets. Recent migrations relaxed these to accept both emoji and non-emoji spellings.
- ops_logs gained columns entity_type, metadata, operation, created_by, created_at along with supporting indexes to remove warnings and make searches efficient.
- If you add or change allowed status/focus_slot values, update BOTH:
  1) The normalization maps in the Node code
  2) The DB check constraints via a migration

## Sync flow (Notion → Supabase → Notion)
1) Fetch pages from Notion using a cursor (pagination) and filter.
2) Normalize fields (status, focus_slot, priority, etc.).
3) Compute a content hash to detect meaningful changes.
4) Upsert into Supabase (insert new, update changed).
5) Persist the Notion cursor and any per-entity sync state to avoid reprocessing.
6) Optionally push calculated fields back to Notion (if configured).
7) Emit ops_logs for observability.

The one-off mode avoids starting the local health server to prevent port conflicts.

## Cursors and pagination
- The Notion API provides next_cursor; the bridge stores it in Supabase so repeated runs resume exactly where they left off.
- If you need a full resync, clear the cursor rows or run the provided clean/reset scripts as appropriate.

## Observability
- Wrapper script writes log files to logs/sync-YYYY-MM-DDTHH-MM-SS.log
- ops_logs table records structured events with metadata for deeper debugging.
- Prefer INFO-level logs for normal operation; use verbose mode to diagnose issues.

## Troubleshooting
- Constraint violations on status or focus_slot
  - Ensure values match canonical forms; the sync normalization should fix common variants.
  - If you add new variants, extend the normalization maps and DB checks in tandem.

- Repeated warnings about ops_logs columns
  - Ensure the latest migrations are applied; after a schema cache refresh these should disappear.

- Port conflicts in one-off mode
  - The server is not started in --once; if you see conflicts, confirm you are not in server/dev mode.

- Stale data
  - Run npm run sync:once when you want to refresh the dashboard.

## Environment
- Use a .env file locally (NOTION_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY or service key, etc.).
- Never echo secrets to the console; pass via environment variables.

## Extending the system
- To add a new focus slot or status:
  1) Expand the normalization mappings in the Node code
  2) Update the DB check constraints and run a migration
  3) Re-run a sync and verify logs are clean

- To move from on-demand to cron later:
  - Wire a scheduler (Railway, GitHub Actions, or a simple OS cron) to call the same one-off entrypoint on your timetable.

