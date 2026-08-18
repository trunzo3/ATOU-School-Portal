---
name: ATOU Airtable base facts
description: IDs and quirks for pulling data from the connected ATOU Airtable base
---

- Base "ATOU": `app9RGanaWFp0BpLh`. Per user instruction (Aug 2026), only the **Workshops** table `tblB8D1tEyxY30LO8` may be used as a data source.
- School Contacts table `tbldPXXbTCSn9aaSH` is used only to resolve contact names/titles: the Workshops lookup `⭐️Contact Name/s` returns **record ids**, not names; `⭐️Contact Email/s` returns actual emails.
- App imports one school row per future-dated workshop (`IS_AFTER({🔹Workshop Date}, TODAY())`); `schools.airtable_record_id` = workshop record id.
- Access via Replit Airtable connector (`listConnections('airtable')` + `proxyFetch('/v0/...')`) — never ask for an API key.
