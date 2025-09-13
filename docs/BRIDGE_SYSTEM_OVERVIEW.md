# QC Bridge v2.1 — System Overview & Runbook

Audience: Junior developers and operators onboarding to the QC Bridge.

Goal: Explain architecture, data model, normalization rules, sync pipeline, constraints, and provide a troubleshooting runbook so common issues can be diagnosed and fixed confidently.

---

## 1) High-level Architecture

- Notion (Quick Capture DB) — source of task input and updates.
- Bridge (Node.js app) — polls Notion, normalizes values, creates/updates records in Supabase, writes back Task IDs to Notion, and maintains a cursor.
- Supabase/PostgreSQL — system of record: ventures, domains, projects, milestones, tasks, focus_slots, integrations_notion, sync_state.

Data flow (once-mode)
1. Bridge loads last_synced_at from sync_state (or uses --since if provided).
2. Queries Notion for pages updated since last_synced_at (with pagination).
3. For each page:
   - Extracts fields
   - Normalizes status, priority, and focus_slot
   - Computes a content hash to detect changes
   - If new/changed, calls RPC create_or_update_task to persist
   - Updates integrations_notion.external_hash and Notion page with Supabase Task ID
4. Updates cursor to the max last_edited_time across fetched pages.

---

## 2) Canonical (non-emoji) Policy

To avoid check constraint drift and mapping ambiguity, the system stores and enforces text-only canonical values:
- Status: "To Do", "In Progress", "Done", "On Hold"
- Priority: P0 (Urgent), P1 (High), P2 (Medium), P3 (Low)
- Focus Slot: Non-emoji names (e.g., "Deep Work Block 2") defined in the focus_slots table.

The app normalizes inputs to these forms prior to DB writes. The DB enforces them with CHECK constraints and a foreign key (focus_slot → focus_slots.slot).

Note: Notion options can still show emojis for user experience. The bridge strips/normalizes values at write-time.

---

## 3) Data Model (Core Tables)

### ventures
- id (UUID, PK)
- name (TEXT)
- slug (TEXT)
- primary_domain_id (UUID → domains.id)
- is_active (BOOLEAN)
- timestamps

### domains
- id (UUID, PK)
- name (TEXT) — e.g., "work", "health"
- slug (TEXT)
- is_active (BOOLEAN)
- timestamps

### projects
- id (UUID, PK)
- name (TEXT)
- venture_id (UUID → ventures.id)
- domain_id (UUID → domains.id)
- status (TEXT) — Recommended values (non-emoji) e.g. "Active", "Complete"
- priority (TEXT) — P0..P3 (optional field)
- timestamps

### milestones
- id (UUID, PK)
- project_id (UUID → projects.id)
- name (TEXT)
- status (TEXT) — e.g. "planned", "in_progress", "completed"
- priority (TEXT) — P0..P3
- timestamps

### tasks (primary workload)
- id (UUID, PK)
- project_id (UUID → projects.id)
- milestone_id (UUID → milestones.id, nullable)
- title (TEXT)
- status (TEXT) — One of: "To Do", "In Progress", "Done", "On Hold"
- due_date (DATE, nullable)
- assignee (TEXT, nullable)
- priority (TEXT) — One of: P0, P1, P2, P3
- focus_slot (TEXT, nullable → focus_slots.slot)
- focus_date (DATE, nullable)
- notion_page_id (TEXT, UNIQUE, nullable) — link back to Notion
- domain_id (UUID → domains.id, nullable)
- venture_id (UUID → ventures.id, nullable)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

Constraints:
- tasks_status_chk: CHECK (status IN ('To Do','In Progress','Done','On Hold'))
- tasks_priority_chk: CHECK (priority IN ('P0','P1','P2','P3'))
- tasks_focus_slot_fkey: FOREIGN KEY (focus_slot) REFERENCES focus_slots(slot)

### focus_slots (source-of-truth for time blocks)
- id (UUID, PK)
- slot (TEXT, UNIQUE, NOT NULL) — e.g., "Deep Work Block 2"
- is_active (BOOLEAN)
- created_at (TIMESTAMPTZ)

Seeded defaults:
- Morning Routine
- Deep Work Block 1
- Admin Block 1
- Recharge & Rest
- Deep Work Block 2
- Admin Block 2
- Shutdown Routine

### integrations_notion
- notion_page_id (TEXT, PK)
- task_id (UUID → tasks.id)
- external_hash (TEXT)
- last_seen_at (TIMESTAMPTZ)
- timestamps

### sync_state
- source (TEXT, PK) — 'notion_quick_capture'
- last_synced_at (TIMESTAMPTZ)
- cursor_data (JSONB)
- updated_at (TIMESTAMPTZ)

---

## 4) RPC: create_or_update_task

Signature (current bridge usage):
- p_title (TEXT)
- p_venture_name (TEXT) — venture name or slug
- p_project_name (TEXT, nullable)
- p_milestone_name (TEXT, nullable)
- p_priority (TEXT, nullable) — P0..P3
- p_status (TEXT, nullable) — "To Do", "In Progress", "Done", "On Hold"
- p_due_date (DATE, nullable)
- p_assignee (TEXT, nullable)
- p_notion_page_id (TEXT, nullable)
- p_focus_date (DATE, nullable)
- p_focus_slot (TEXT, nullable)

Behavior:
1. Resolves venture_id (via name or slug) and domain_id (via venture.primary_domain_id).
2. Finds or creates project (under venture). If provided, finds or creates milestone under that project.
3. Creates the task with normalized status/priority/focus_slot.
4. Links to integrations_notion (upserts notion_page_id → task_id, external_hash, last_seen_at).

Notes:
- RPC should default to canonical values or normalize input. The bridge already normalizes before calling.

---

## 5) Sync Pipeline — Detailed

1) Cursor fetch:
- Reads sync_state.last_synced_at for source='notion_quick_capture'. Falls back to a default if missing.

2) Notion query (paginated):
- Queries by last_edited_time >= last_synced_at.
- Follows next_cursor, accumulating all results.

3) Extraction and normalization (per page):
- title ← Notion Task
- venture/area ← Notion Venture (or fallback Domain for area)
- project ← Project text
- milestone ← Milestone text
- status ← normalized to one of: To Do, In Progress, Done, On Hold
- priority ← normalized to P0..P3
- focus_date ← Notion Focus Date
- focus_slot ← mapped to canonical via focus_slots (emoji stripped and matched)
- due_date ← Notion Due Date
- supabaseTaskId, linked (from Notion)

4) Change detection:
- Hash is computed from canonicalized values: title, domain/venture, project, milestone, priority, status, focus_slot, focus_date, due_date, assignee.
- needsSync checks integrations_notion.external_hash for the page.

5) Persisting:
- Calls RPC create_or_update_task with normalized values and notion_page_id.
- Updates integrations_notion.external_hash & last_seen_at.
- Updates Notion page with Supabase Task ID and checks Linked.

6) Cursor update:
- Sets sync_state.last_synced_at to the max last_edited_time of all fetched pages.

---

## 6) Operational Runbook

One-off run (recommended during development/testing):
- npm run once

Continuous run (health server optional):
- If you enable the health server, it exposes endpoints: /health, /metrics, /api/sync
- In once-mode we skip starting the health server to avoid port conflicts.

Configuration (env):
- Notion: databaseId, token
- Supabase: url, anon/service role key
- Rate limiting and retry settings are configurable in config.

---

## 7) Troubleshooting Guide

Check constraint violations (status/priority/focus_slot):
- tasks_status_chk — Verify the value is exactly one of: "To Do","In Progress","Done","On Hold".
- tasks_priority_chk — Verify value is one of: P0,P1,P2,P3.
- tasks_focus_slot_fkey — Verify value exists in focus_slots.slot. Add missing slots there first.

Common steps:
1. Inspect constraint: SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '<name>';
2. Inspect data: SELECT DISTINCT <column> FROM tasks ORDER BY 1;
3. Normalize offending rows.

No pages to sync:
- Verify the cursor/since filter; use --since to force a backfill.

RPC errors:
- If venture not found: ensure p_venture_name matches a venture's name or slug (case-insensitive).

---

## 8) Setup & Migrations (Quick Reference)

Run in Supabase SQL Editor:
1) Create focus_slots: docs linked file sql/create_focus_slots.sql
2) Standardize tasks + constraints: docs linked file sql/standardize_non_emoji.sql

Ensure RPC create_or_update_task matches bridge expectations (p_venture_name, etc.).

---

## 9) Conventions Recap

- Store canonical, non-emoji values in DB.
- Let Notion display emojis; the app normalizes at write-time.
- Keep CHECK constraints simple and aligned with the canonical sets.
- Use focus_slots as the source-of-truth for Focus Slot values.

---

## 10) Contact & Handover

- This document plus the Bulk Task Creation Guide should be enough for a junior developer to understand the system, run it, and troubleshoot common issues.
- For any schema drifts, start by inspecting constraints and distinct values, then normalize data accordingly.

