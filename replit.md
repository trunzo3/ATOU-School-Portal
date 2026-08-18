# ATOU Workshop Logistics Portal

## Overview
Workshop-logistics app for A Touch of Understanding (ATOU), a nonprofit running
disability-awareness workshops at ~140 schools/year. Two surfaces:

- **School portal** (`/s/<code>`): email-verified access (checked against the
  school's contact list, typed every visit, never remembered), five logistics
  questions with full change history on every answer, autosave, confirmation
  page, printable paper form.
- **Admin dashboard** (`/` → login, `/admin`): grid of schools × questions with
  missing flags, copy-link buttons, per-school form reusing the same shared
  form component, edit locks, email-send prep, rich-text info pages with
  export, admin account management, Airtable settings.

## Key business rules
- Pam's email `programcoordinator@touchofunderstanding.org` is authorized for
  every school and can edit locked schools.
- Question keys: `workshop_time`, `timing_note`, `activity_area`,
  `speaker_area`, `notes` (notes never goes to Airtable). Teachers are saved as
  full snapshots with a computed student-count total.
- Workshop time is the start time only; display computes
  "8:00 – 9:30 AM, break, 9:45 – 11:15 AM". All times Pacific.
- Answer history is append-only — every save is a new row; this history is the
  point of the app.
- **Airtable connection is switched OFF** in this build. Settings are stored
  and write/read functions exist in `artifacts/api-server/src/lib/airtable.ts`
  (with field IDs documented) but do nothing until config is filled in.
- Resend email is NOT connected; the "send" page only prepares subject/body
  for copy-paste.
- School links are built from the `APP_BASE_URL` env var (falls back to the
  current Replit domain).
- The root login page has a dev-only "log in as Pam" button
  (`POST /api/admin/dev-login`) — remove before go-live.

## Architecture
pnpm monorepo:
- `artifacts/atou-portal` — React + Vite frontend (wouter, React Query hooks
  from `lib/api-client-react`, shadcn UI). Shared form component:
  `src/components/shared/school-form.tsx`, used by both portal and admin.
- `artifacts/api-server` — Express 5 API. Routes: `src/routes/portal.ts`,
  `src/routes/admin.ts`. Auth: signed cookie sessions (SESSION_SECRET),
  scrypt password hashes (`src/lib/auth.ts`).
- `lib/db` — Drizzle/Postgres. Schema: `src/schema/schools.ts` (schools,
  contacts, answers history, teacher snapshots), `src/schema/admin.ts`
  (admin_users, info_pages, app_settings key/value).
- `lib/api-spec/openapi.yaml` — API contract; codegen produces
  `lib/api-zod` (server validation) and `lib/api-client-react` (hooks).

## Data
Real school/contact data is imported from Airtable (Replit Airtable connector,
base "ATOU" `app9RGanaWFp0BpLh`, **Workshops** table `tblB8D1tEyxY30LO8` only,
contact names resolved via School Contacts `tbldPXXbTCSn9aaSH`). One school
row per future-dated workshop; `schools.airtable_record_id` stores the
workshop record id for write-back. `schools.approx_students` is a read-only
copy of the Workshops "Approx # Students" column, shown in the admin
dashboard (per user decision: answers already typed into the Workshops sheet
are NOT imported; schools start blank in the app). Re-run:
`pnpm --filter @workspace/scripts run import-airtable` (DESTRUCTIVE — wipes
schools, contacts, answers, teacher snapshots; the payload JSON
`scripts/src/airtable-import.json` is refreshed from Airtable by the agent).
The old sample-data seed (`run seed`) still exists but is superseded.
Write-back to Airtable remains switched OFF.

## User preferences
(none recorded yet)
