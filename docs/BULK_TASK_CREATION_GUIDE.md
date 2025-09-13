# Bulk Task Creation Guide (Non-Emoji Canonical)

This guide covers how to generate and ingest bulk tasks in a format that fits the bridge and the database. It includes:
- A prompt template to generate well-formed tasks.
- Output schemas for Notion CSV and direct DB insert (CSV/JSONL).
- Field rules and hierarchy mapping (venture → project → milestone → tasks).

---

## 1) Canonical Fields & Allowed Values

- title (TEXT): Task title
- venture (TEXT): Venture slug or venture name (bridge resolves either). Example: hikma, aivant-realty, arab-money
- project (TEXT, optional): Project name under the venture. Auto-created if missing.
- milestone (TEXT, optional): Milestone name under the project. Auto-created if missing.
- status (TEXT): One of "To Do", "In Progress", "Done", "On Hold"
- priority (TEXT): One of P0, P1, P2, P3
- due_date (DATE, optional): ISO date YYYY-MM-DD
- focus_date (DATE, optional): ISO date YYYY-MM-DD
- focus_slot (TEXT, optional): Must match focus_slots.slot (Non-emoji). Examples:
  - Morning Routine
  - Deep Work Block 1
  - Admin Block 1
  - Recharge & Rest
  - Deep Work Block 2
  - Admin Block 2
  - Shutdown Routine
- assignee (TEXT, optional)

Notes:
- The bridge normalizes, but keeping inputs canonical avoids friction and maximizes acceptance by DB checks.

---

## 2) Prompt Template (for LLM or content generation)

Use this prompt to generate a bulk set of tasks in the correct hierarchy and format. The goal is to copy the output directly to a CSV/JSONL that the bridge or DB can ingest.

"""
You are generating a bulk task list for a venture/project/milestone hierarchy.

Rules:
- Use only non-emoji canonical values.
- status ∈ {"To Do","In Progress","Done","On Hold"}
- priority ∈ {P0, P1, P2, P3}
- focus_slot ∈ {"Morning Routine","Deep Work Block 1","Admin Block 1","Recharge & Rest","Deep Work Block 2","Admin Block 2","Shutdown Routine"}
- All dates are YYYY-MM-DD.
- venture must be an existing venture name or slug (e.g., "hikma"). If unsure, choose from the known set.
- project and milestone are optional; if present, they will be auto-created under the venture/project if not found.

Produce output in CSV with header and the following columns:
  title,venture,project,milestone,status,priority,due_date,focus_date,focus_slot,assignee

Example rows:
- "Prepare 2025 Q1 plan",hikma,"Strategic Planning 2025","Phase 1","To Do","P1",2025-01-31,2025-01-15,"Deep Work Block 1","me@example.com"
- "Invoice review",hikma,"Finance Ops",,"In Progress","P2",2025-02-10,,"Admin Block 1","me@example.com"

Now generate N=25 tasks spread across 2–3 ventures, each with sensible projects/milestones, varied priorities and statuses, and realistic focus assignments.
"""

Tips:
- Ask the model to ensure focus_slot is chosen only from the listed canonical names.
- Keep consistency: same venture should reuse the same project names where logical.

---

## 3) Output Formats

### A) Notion CSV (for import into the Quick Capture DB)
- Columns: Task (title), Venture (select), Project (text), Milestone (text), Status (select), Priority (select), Due Date (date), Focus Date (date), Focus Slot (select), Assignee (text)
- Export/transform from the generated CSV (section 2) by renaming columns:
  - title → Task
  - venture → Venture
  - project → Project
  - milestone → Milestone
  - status → Status
  - priority → Priority
  - due_date → Due Date
  - focus_date → Focus Date
  - focus_slot → Focus Slot
  - assignee → Assignee

Ensure the Notion select options match the canonical names. The bridge normalizes but matching names speeds up mapping.

### B) Direct DB insert (CSV to staging table or JSONL to an ingestion endpoint)
- Preferred schema (staging table bulk_tasks):
  - id (UUID, default gen_random_uuid())
  - title TEXT NOT NULL
  - venture TEXT NOT NULL
  - project TEXT NULL
  - milestone TEXT NULL
  - status TEXT NOT NULL CHECK (status IN ('To Do','In Progress','Done','On Hold'))
  - priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3'))
  - due_date DATE NULL
  - focus_date DATE NULL
  - focus_slot TEXT NULL REFERENCES focus_slots(slot)
  - assignee TEXT NULL
  - processed_at TIMESTAMPTZ NULL

- Bulk load CSV into bulk_tasks, then run a stored procedure to upsert into projects/milestones/tasks using the same normalization as the bridge.

Example JSONL (one task per line):
```json
{"title":"Prepare 2025 Q1 plan","venture":"hikma","project":"Strategic Planning 2025","milestone":"Phase 1","status":"To Do","priority":"P1","due_date":"2025-01-31","focus_date":"2025-01-15","focus_slot":"Deep Work Block 1","assignee":"me@example.com"}
{"title":"Invoice review","venture":"hikma","project":"Finance Ops","status":"In Progress","priority":"P2","due_date":"2025-02-10","focus_slot":"Admin Block 1","assignee":"me@example.com"}
```

---

## 4) Hierarchy & Auto-Creation Rules

- venture (name/slug) → resolves venture_id and domain_id
- project (optional) → under venture; created if not found
- milestone (optional) → under project; created if not found
- task → created under project/milestone with canonical values

If venture is missing/unknown, the bridge/RPC will error. Ensure ventures exist first.

---

## 5) Validation Checklist

Before importing:
- Status values only: To Do, In Progress, Done, On Hold
- Priority values only: P0, P1, P2, P3
- Focus Slot only from focus_slots
- Dates are YYYY-MM-DD
- Venture is valid and exists (name or slug)
- Titles are non-empty

---

## 6) Optional: Direct DB Ingestion Procedure (Sketch)

- Create a staging table bulk_tasks (as above).
- Create a function process_bulk_tasks() that loops rows and calls the same logic as RPC (or an internal version) with normalization.
- Mark rows processed_at when done; log failures per-row for quick corrections.

This keeps bulk operations auditable and avoids partial failures.

---

## 7) Troubleshooting Bulk Imports

- Constraint violations (status/priority/focus_slot): correct the rows to canonical values and retry.
- Unknown venture: create the venture first (with correct slug/name) or fix the venture field.
- Focus Slot missing from focus_slots: insert the new slot into focus_slots then retry.

---

## 8) Summary

- Use the prompt template to generate CSV/JSONL with canonical values and valid hierarchy.
- Import into Notion or bulk load into a staging table for DB ingestion.
- The bridge will normalize and enforce constraints, ensuring the dashboard reflects clean, consistent data.

