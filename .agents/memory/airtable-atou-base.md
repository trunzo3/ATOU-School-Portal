---
name: ATOU Airtable base facts
description: IDs and quirks for the connected ATOU Airtable base (Workshops table)
---

- Base "ATOU": `app9RGanaWFp0BpLh`. Per user instruction (Aug 2026), only the **Workshops** table `tblB8D1tEyxY30LO8` may be used as a data source.
- School Contacts table `tbldPXXbTCSn9aaSH` is used only to resolve contact names/titles: the Workshops contact-name lookup returns **record ids**, not names; the contact-email lookup returns actual emails. Contacts pair positionally: name[i] ↔ email[i] ↔ title[i]; display name = `Name (Title)`.
- Workshop-date field's *name* (for `filterByFormula`) is exactly `Workshop Date` — no 🔹 prefix. Future rows: `IS_AFTER({Workshop Date}, TODAY())`. Always request `returnFieldsByFieldId=true`.
- School name comes from the "School (reformat)" formula field; field ids for all mapped columns are documented in `artifacts/api-server/src/lib/airtable.ts`.
- **Every mapped Workshops column is a text type** (single/multiline). Airtable text fields reject raw numbers even with `typecast: true` (422 INVALID_VALUE_FOR_COLUMN) — stringify all outgoing values.
- "Approx # Students" and the app's total-student-count write-back are the **same field id** — so the app sets `approxStudents` at school creation only and never pulls it later, to avoid loops.
- Access via the Replit Airtable connection (`@replit/connectors-sdk`, `new ReplitConnectors().proxy("airtable", path, init)`) — never ask for an API key.
