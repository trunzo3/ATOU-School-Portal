---
name: Pending Send display rule
description: How the dashboard's Pending Send date is computed now that a real automation scheduler exists.
---

A real automation scheduler now exists (in-server, checks every 15 minutes; plus a manual daily script). Auto-logistics settings are now a list of up to two RULES (template + days-before, each template usable once). The Pending Send column is about a school's FIRST email, so it follows only the first-contact (request) rule; the follow-up rule never applies to never-emailed schools. The date is computed per school as workshop date minus the request rule's days-before, and shows only when ALL of:

- the school has never been sent an email,
- the school is not auto-send-skipped and not locked,
- the computed date is today or later (past-due dates render as "Not sent" with no date — the automation only fires on the exact day, so a passed date will never send).

When the auto-logistics switch is OFF, the legacy display-only behavior applies (computed date shown as informational, suppressed once the workshop is under 30 days out). When the switch is ON, the date is a real promise: the scheduler will send on that day.

**Why:** Pam needs the dashboard date to mean the same thing the automation will actually do; a skipped school shows a dash so "no email coming" is visible at a glance.

**How to apply:** any surface showing a scheduled/pending send date must go through the shared pending-send helper (options object: skipped/daysBefore/autoEnabled/today) rather than recomputing workshop−60.
