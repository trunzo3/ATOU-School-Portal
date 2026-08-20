---
name: Teacher count completeness rule
description: studentCount 0 means "not entered"; missing counts make a school partial everywhere
---

- A teacher row's studentCount of 0 is the representation for "not entered" across the whole app (form, dashboard, confirmation screen, server). The schema still allows 0 so identity-complete rows can save before counts are known.
- **Why:** counts arrive later than names/emails; blocking saves on counts lost data, so 0-as-missing was chosen over a nullable schema change.
- **How to apply:** any new surface that judges completeness must use the same rule — `Number(studentCount) > 0` — and the server's question-state `incomplete` flag / `missingCount()` already encode it for admin aggregates. Don't invent a second rule client-side; the wording "…, one/two teacher count(s) missing" (spelled-out through ten) is the shared phrasing.
