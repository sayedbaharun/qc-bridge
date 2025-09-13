# QC Bridge — First-Use Operations Rulebook

This rulebook gives you a clear, repeatable process for setting up and running the Notion → Supabase bridge on-demand. It covers first-time setup, daily usage, what counts as a change, and how to troubleshoot safely.

----------------------------------------
1) TL;DR Quick Start
----------------------------------------
- Prereqs: Node 20+, npm, a Notion database, and a Supabase project.
- Configure .env (see Section 2).
- Dry run to validate: npm run dry-run
- Real run (with locking + logs): npm run sync:once
- Verify:
  - Logs: logs/sync-YYYY-MM-DDTHH-MM-SS.log
  - Supabase: tasks, integrations_notion
  - Notion: “Supabase Task ID” and “Linked” set on processed pages

Daily: Add tasks in Notion → run qc-sync (alias) once per day → check dashboard.

----------------------------------------
2) Required Secrets & Config
----------------------------------------
Create a .env file at the repo root. Never commit secrets.

Required
- NOTION_TOKEN=...            # Notion internal integration token
- NOTION_DATABASE_ID=...      # ID of your tasks database in Notion
- SUPABASE_URL=...            # https://<project>.supabase.co
- SUPABASE_SERVICE_ROLE=...   # Preferred; full access for server-side sync
  OR
- SUPABASE_ANON_KEY=...       # Limited; acceptable if service role not available

Optional
- NOTION_ALERTS_DATABASE_ID=...  # Only if you use Notion-based alerting

Security tips
- Store secrets in .env only (already in .gitignore)
- Do not echo secrets; do not paste them in commands

----------------------------------------
3) Notion Database Expectations
----------------------------------------
Your database should have these properties (names can be adjusted in code, but these are the defaults):
- Task (Title)
- Domain (Select)
- Venture (Select)
- Priority (Select)
- Status (Select)
- Focus Slot (Select)
- Focus Date (Date)
- Due Date (Date)
- Assignee (Rich text)
- Supabase Task ID (Rich text)
- Linked (Checkbox)

Tip: Keep the property names consistent; the sync uses these keys to extract data.

----------------------------------------
4) Canonical Values & Normalization
----------------------------------------
The sync normalizes values before writes and when hashing to avoid false changes.

Status (emoji canonical examples)
- 📝 To Do, 🚧 In Progress, ⛔ Blocked, ✅ Done, 📦 Archived
- Common variants like "To do" or "Todo" are mapped safely to emoji canonical.

Focus Slot (emoji canonical examples)
- 🧠 Deep Work 1, 🧠 Deep Work 2, 📋 Admin Block 1, 📋 Admin Block 2, 🤝 Meetings, ⏳ Buffer
- Common non-emoji inputs are mapped to canonical emoji values.

Priority
- P0, P1, P2, P3 (default P2)

Important: The database accepts both emoji and non-emoji variants (migrations applied), but the sync stores and hashes using canonical emoji forms for consistency.

----------------------------------------
5) Commands You’ll Use
----------------------------------------
- One-off sync (recommended): npm run sync:once
  - Safer wrapper with a lock and timestamped logs
- Alias (trigger from anywhere): qc-sync
  - Add via: echo "alias qc-sync='(cd /path/to/qc-bridge && npm run sync:once)'" >> ~/.zshrc
  - Then: source ~/.zshrc
- Dry run (no writes): npm run dry-run
- Raw entrypoint (no wrapper): npm run once
- Long-running (optional during dev): npm run dev or npm run server

Logs are written to logs/sync-YYYY-MM-DDTHH-MM-SS.log

----------------------------------------
6) What Triggers a Sync vs Skip
----------------------------------------
- We compute a content hash over meaningful Notion fields (title, domain, venture, project, milestone, priority, due date, assignee, status, focus slot, focus date).
- We store the last hash in Supabase (integrations_notion.external_hash). On the next run, if the hash hasn’t changed, the page is skipped.
- We do NOT update the Notion page if it is already linked (Supabase Task ID matches and Linked is true). This avoids bumping last_edited_time and reprocessing.
- Changing fields like Status or Priority will trigger an update. Cosmetic/integration-only changes will not.

----------------------------------------
7) First-Time Setup Checklist (One-Time)
----------------------------------------
1. Confirm .env is configured (Section 2)
2. Ensure Notion database has the expected properties (Section 3)
3. Run a dry run: npm run dry-run
4. Run a real sync: npm run sync:once
5. Verify in Supabase:
   - tasks table has new/updated rows
   - integrations_notion has the notion_page_id, task_id, and external_hash entries
6. Verify in Notion that processed pages have Supabase Task ID and Linked checked

----------------------------------------
8) Daily Operations (Repeatable)
----------------------------------------
- Add or update tasks in Notion throughout the day
- Run qc-sync once daily (or npm run sync:once)
- Confirm the dashboard refreshes; review the latest log under logs/
- If something looks off, run npm run dry-run to inspect without writes

----------------------------------------
9) Troubleshooting Quick Reference
----------------------------------------
No pages processed
- Check the last_synced_at cursor (we advance to latest last_edited_time). Make a small change in Notion (e.g., status) and run again.

Constraint errors (status/focus_slot)
- Ensure your inputs match the canonical sets or common variants (Section 4)
- If you add new allowed values, update both the normalization maps in code AND the DB checks via a migration

Repeated re-creates or updates
- We skip updating the Notion page if already linked; if you still see repeats, confirm the Supabase Task ID matches and Linked is true in Notion

Port conflicts (rare in on-demand)
- Don’t use server/dev modes for one-off runs; npm run sync:once doesn’t start the health server

Secrets issues
- Ensure .env has the correct values and is readable by Node (dotenv)

Rate limits
- Runs are modest; if you hit rate limits, space out runs or reduce page_size/batch frequency

----------------------------------------
10) Maintenance & Change Management
----------------------------------------
Add a new Status or Focus Slot value
1. Update normalization in code to map new inputs to the canonical value
2. Update database check constraints in a migration to accept the new value(s)
3. Apply the migration in Supabase
4. Run a sync and verify logs are clean

Full re-sync (rare)
- Clear or backdate the cursor in sync_state for source='notion_quick_capture', then run npm run sync:once

Observability
- Each run creates a timestamped log in logs/
- The ops_logs table captures structured events for deeper analysis

----------------------------------------
11) Safety Rules (Do’s and Don’ts)
----------------------------------------
Do
- Use npm run sync:once (or qc-sync) for daily on-demand runs
- Keep secrets in .env (never commit)
- Use npm run dry-run when testing schema or mapping changes
- Commit and push code/migration changes before running in production

Don’t
- Don’t edit logs/ or .sync.lock in version control (they’re ignored)
- Don’t start long-running modes for simple on-demand usage
- Don’t change canonical value sets without also updating DB checks and normalization

----------------------------------------
12) Command Cheat Sheet
----------------------------------------
- Dry run: npm run dry-run
- One-off sync (logged/locked): npm run sync:once
- Alias from anywhere: qc-sync (after adding to ~/.zshrc)
- Raw once (no wrapper): npm run once

----------------------------------------
13) Glossary
----------------------------------------
- Canonical value: The normalized, emoji-prefixed value stored and hashed by the bridge
- External hash: Deterministic hash of meaningful fields to detect changes
- Linked: Notion checkbox property indicating the page is linked to a Supabase task
- integrations_notion: Table that stores notion_page_id → task_id + external_hash + last_seen_at

----------------------------------------
14) When You’re Ready for Automation
----------------------------------------
- Add a GitHub Actions workflow or a scheduled job on your host (Railway, etc.) to invoke the same one-off entrypoint on your desired cadence (e.g., nightly). Keep using the on-demand flow until you fully trust the behavior.

