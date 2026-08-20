---
name: School email signature policy
description: The one-signature rule for ATOU school emails and the legacy WORKSHOP DATE merge marker
---

- Rule: Pam's contact block ("Pam Evers" … "www.touchofunderstanding.org") lives INSIDE the editable template/message body. Never append a signature (or any other content) automatically to school or test emails — text and HTML parts must match the composed body exactly.
  - **Why:** An earlier build appended a polished signature (cancellation-policy link + badge strip) on top of the typed block, so recipients saw two signatures; Pam asked for the single plain-block format (fixed August 2026).
  - **How to apply:** When touching email sending/preview, keep body-only rendering; template seeding/repair ensures a body without a "Pam Evers" line gets the plain block appended (idempotent, preserves admin wording).
- Merge fields: besides `{{school_name}}`/`{{workshop_date}}`/`{{link}}`, the literal all-caps marker `WORKSHOP DATE` (from Pam's original wording) must also resolve to the formatted date ("TBD" when the school has no date), identically server-side and in the client preview.
- Known quirk (out of scope then): `formatPacificTime` in the portal parses bare `YYYY-MM-DD` as UTC midnight, so list displays can show the day BEFORE the real workshop date; email merge formatting uses `T12:00:00-08:00` and is correct.
