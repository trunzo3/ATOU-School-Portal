---
name: Airtable sync is production-only
description: Environment gate that isolates dev from the shared Airtable base
---

Dev and prod portals share ONE Airtable base, so any dev sync cross-contaminates production (dev pushes, prod pulls). All Airtable touchpoints — scheduled sync, live portal-save write-backs, manual "Sync now", and the admin status probe — go through a single `airtableSyncAllowed()` gate (see api-server lib/environment.ts).

**Rule:** the gate is true only when `NODE_ENV === "production"` (same rule as dev-login) or when the dev override `AIRTABLE_SYNC_DEV_OVERRIDE=true` is set. Never add a new Airtable call path that bypasses this gate.

**Why:** before Aug 2026 the sync ran unconditionally in every environment and dev edits flowed into the live base, then back into the production database.

**How to apply:** any new code that reads from or writes to Airtable must check `airtableSyncAllowed()` first; skipped write-backs are safe because per-field baselines only advance on successful pushes, so unsynced portal changes still look "portal-changed" to a later production sync. The admin UI reports the gate honestly (`syncAllowed`/`devOverrideActive` on the Airtable status endpoint) instead of showing the connector as active in dev. The sidebar shows a server-reported environment badge from `/admin/me`. An admin-wide watcher polls the status every 60s and toasts on changes (connection lost/restored, sync failing/recovering) — alert toasts must set a long `duration`, because the shadcn/Radix default auto-dismisses in ~5s, which users (and tests) miss.
