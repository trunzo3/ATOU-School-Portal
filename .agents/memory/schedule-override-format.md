---
name: Schedule override answer format
description: Contract for the schedule_override answer key — readable text that must round-trip, blank means reset.
---

The hand-adjusted provisional schedule is stored under the `schedule_override` answer key as human-readable lines, one per schedule row: `Session 1: 8:15 AM – 9:45 AM` (labels limited to Session 1/Break/Session 2/Lunch/Session 3; en dash or hyphen both parse).

**Rules:**
- Blank value = "reset to calculated"; `schedule_override` is the ONLY answer key the save endpoint accepts blank for (every other key still rejects blanks server-side, and the shared-form client helpers skip blanks).
- Non-blank values must parse (`parseScheduleOverride`) or the endpoint 400s — the format doubles as the history display text, so it must round-trip exactly.
- A parseable override suppresses calculated-schedule conflict flags everywhere (question states/admin grid, weekly summary, Done page) — keep all three in agreement if the rule changes.
- Untouched schedule = live recalculation; the client materializes an override only on first manual edit, after which recalculation never overwrites it.

**Why:** the schedule box serves two audiences through one shared form and one tracked answer; storing readable text keeps history human-legible without a custom renderer.

**How to apply:** any new surface that shows the calculated schedule or judges schedule conflicts must first check for a parseable `schedule_override`.
