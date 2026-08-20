---
name: Pending Send display rule
description: Dashboard Pending Send is a computed display rule — no email scheduler exists in the app.
---

The rule: the admin dashboard's Pending Send column shows the date the
logistics email is meant to reach a school — workshop date minus 60 days —
only for schools that have never been emailed, and only until the workshop is
less than 30 days away. Everything else shows a dash. Computed server-side
(`pendingSendDate` in the api-server's lib, unit-tested); there is NO
automatic email scheduler anywhere in the code — Pam sends manually.

**Why:** the original spec says logistics emails go out "two months out" but
are sent by hand. The 30-day cutoff keeps a slightly-overdue date visible as a
nudge, while dropping dates so stale the two-months-out email no longer makes
sense. The user declined to specify the overdue rule, so this cutoff was
chosen as the one rule consistent with their mockup.

**How to apply:** if a real scheduler or a "skip" concept is ever added, this
column should switch from the computed rule to actual schedule data. Don't
invent per-school pending-send state in the DB for display purposes.
