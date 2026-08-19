---
name: Email sending switch scope
description: The email_sending_enabled setting gates school mailings only, not operational email
---

- The `email_sending_enabled` app setting is the on/off switch for school campaign mailings only.
- **Why:** Operational emails (e.g. password resets) must still work when mailings are paused — a locked-out admin needs the rescue path. A completion review rejected coupling them.
- **How to apply:** New operational/system emails should check only `emailConfigured()` (Resend key present), never the mailing switch. Also: password resets must atomically claim the single-use token (conditional UPDATE in a transaction) and invalidate previously issued sessions (issued-at check against `password_changed_at`).
