---
name: Date-only rendering rule
description: YYYY-MM-DD strings must never go through timestamp formatting in Pacific time — it shifts the calendar day back one.
---

The rule: date-only values (workshop dates, pending-send dates — any bare
YYYY-MM-DD from the DB) must be formatted as plain calendar dates (UTC), never
parsed with `new Date(str)` and formatted in `America/Los_Angeles`.

**Why:** JS parses a bare YYYY-MM-DD as midnight UTC, which is the previous
evening in Pacific time, so the rendered day is one early. This bug shipped in
the portal's shared `formatPacificTime` and made every admin/portal date-only
display one day early until fixed in Aug 2026 — the user's dashboard mockup
even contained the wrong (shifted) dates, copied from the buggy screen. The
DB/Airtable dates are the truth; after the fix, on-screen dates appeared to
"move forward one day" but are now correct and match the emails (server-side
merge fields were always right).

**How to apply:** `formatPacificTime` in the portal's `lib/utils.ts` now
special-cases `^\d{4}-\d{2}-\d{2}$` and formats in UTC — keep routing date
display through it. When verifying dates end-to-end, compare against the DB
values, not against what the screen used to show. Timestamps (createdAt,
sentAt, enteredAt) still format in Pacific as before.
