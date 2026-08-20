---
name: Airtable two-way sync design
description: Conflict rules and invariants of the live portal↔Airtable sync
---

Durable rules to stay consistent with:
- **Portal wins conflicts.** Three-way merge per field against a last-synced baseline stored on the school (jsonb): portal≠baseline → push (even if Airtable changed too); only Airtable≠baseline → pull as a history row entered by `"Airtable"`. Workshop date and contacts are pull-only; notes/timing answers never sync.
  **Why:** the portal's history is the product; Airtable is the mirror.
- **Pulls are guarded conditional inserts.** A pull only lands if the answer/teacher snapshot is still exactly what the sync read when deciding (single INSERT…WHERE NOT EXISTS "newer entry"). A portal save or amend that lands mid-run turns the pull into a no-op; the next pass pushes the portal value.
  **Why:** an unguarded insert let a stale Airtable value become the newest history entry over a concurrent portal save.
- **Millisecond truncation in timestamp guards.** Postgres keeps microseconds, JS Date only milliseconds — compare `date_trunc('milliseconds', col)` against a JS-sourced timestamp or a row looks newer than its own snapshot.
- **Compare trimmed values everywhere.** Baselines are stored trimmed; teacher name/email text built from rows can carry blank lines. An untrimmed compare re-pushes the same fields on every pass forever.
- **Push failures never block portal saves** — the write-back returns false instead of throwing and only advances the baseline on success, so the next scheduled pass retries.
- **Run claim in app_settings** with stale takeover (>10 min), shared by the 15-min scheduler and admin "Sync now" — same protocol as email send-claims.
- Teachers are decided as a name+email **pair** (one composite decision); a teacher push also writes the student total.
- **Schema upgrades ship as idempotent boot DDL** in the API server (column/constraint "IF NOT EXISTS" before listen), because production databases only get what the server applies itself — drizzle push is dev-only here.
