---
name: Time-picker edit sessions (amend-in-place history)
description: How one-history-entry-per-edit-session works for time pickers, and the Radix focus pitfalls that break outside-detection.
---

The time pickers save every part change (hour/minute/AM-PM) immediately, but all saves in one edit session amend the SAME answers row via an optional `amendId` in the save body. The server amends only in a single conditional UPDATE (id + school + question + same normalized enteredBy + "no newer row exists" via NOT EXISTS) — never select-then-update, or a concurrent save can get its newer row rewritten. If the condition fails it falls back to appending.

**Why:** answers history is append-only and user-facing; per-part rows flooded it, but mid-edit values must still persist in case the tab closes.

**How to apply:**
- Client session rules: saves for a key are serialized on a per-key promise chain so the first INSERT's id reaches later amends. Session end (focus/click truly outside the control) must be enqueued BEHIND that chain — clearing the amend id while a save is in flight causes duplicate rows.
- Radix Select focus pitfalls (cost several debugging rounds):
  1. After closing a dropdown, focus momentarily rests on `<body>` — never treat that as "left the control".
  2. The just-closed dropdown's PORTALED content can still hold focus for a beat; outside-detection must ignore targets/activeElement inside `[data-radix-popper-content-wrapper]` or `[role="listbox"]`, or sessions end after every part change.
  3. While a dropdown is open, outside clicks are swallowed (they only dismiss); re-check where focus settled after `onOpenChange(false)` (setTimeout 0) to catch dismiss-by-outside-click.
- A "part change wasn't saved" report can be a no-op click on the already-selected AM/PM button — correct dedupe, not a bug; check server logs for whether a PUT fired before hunting client races.
