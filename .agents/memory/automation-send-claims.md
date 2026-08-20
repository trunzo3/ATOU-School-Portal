---
name: Automation send-claim protocol
description: Every automatic email must be claimed in the database BEFORE calling Resend; how each claim works.
---

Rule: no automatic email (auto logistics, weekly summary, Send now) may call Resend before atomically claiming the send in the database. Post-send recording is forbidden as the dedup mechanism.

- Auto logistics: one transaction takes pg_advisory_xact_lock(823001, schoolId), re-checks the enabled switch + school skip/lock + send history under the lock, and inserts the email_sends row with delivered=false. Delivery then runs outside the transaction; success flips delivered=true. A failure or crash leaves a visible "Not delivered" row and the school is never retried (exactly-daysBefore rule).
- Weekly summary: claim = single UPDATE of app_settings weekly JSON setting lastSentAt via jsonb_set, guarded by `lastSentAt IS NOT DISTINCT FROM <value read earlier>` (plus `enabled='true'` for the scheduled path only — Send now works with the switch off). Losing a claim means another run is sending; back off. If Resend then fails, the week is burned by design (Send now is the recovery).
- Weekly settings form saves use an upsert where the STORED lastSentAt always wins over the submitted one, so a form save can't erase a timestamp the job wrote concurrently.

**Why:** an architect review found the original check-then-send-then-record flow could double-email schools when runs overlap or crash between provider-accept and DB write. The scheduler runs in-process every 15 minutes (Replit can't run a scheduled deployment beside the web deployment in this multi-artifact project), so overlap is a normal condition, not an edge case.

**How to apply:** any new automated mailing must follow the same claim-before-send shape; frequency of scheduler checks is safe to change because dedup never depends on run cadence.
