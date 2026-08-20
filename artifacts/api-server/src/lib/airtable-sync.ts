/**
 * Periodic two-way sync with the Airtable Workshops table.
 *
 * Pull (Airtable → app), on the scheduler cadence and via "Sync now":
 *   - new future-dated workshop records become schools (with contacts and
 *     starting answers),
 *   - workshop date and contact changes update existing schools,
 *   - Airtable-side edits of mapped answer fields become history entries
 *     attributed to "Airtable".
 *
 * Push (app → Airtable) happens live on every portal save (see
 * writeAnswersToAirtable); this sync also re-pushes anything a failed
 * write-back left behind, using the per-field last-synced state on each
 * school. When BOTH sides changed a field between syncs, the portal wins
 * and its value is pushed back (see airtable-merge.ts for the rules).
 *
 * Never deletes a school and never re-runs the destructive import. Only
 * future-dated Workshops rows are read; the School Contacts table is read
 * solely to turn contact record ids into names.
 *
 * Every run is claimed in the database first (same pattern as the email
 * automation), so overlapping runs — scheduler tick, Sync now, or several
 * server instances — never process the same pass twice.
 */
import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  answersTable,
  contactsTable,
  schoolsTable,
  teacherSnapshotsTable,
  type School,
} from "@workspace/db";
import {
  AIRTABLE_BASE_ID,
  AIRTABLE_FIELDS,
  CONTACT_NAME_FIELD_ID,
  CONTACTS_TABLE_ID,
  WORKSHOPS_TABLE_ID,
  airtableRequest,
  formatTeacherEmails,
  formatTeacherNames,
  isAirtableConfigured,
  writeAnswersToAirtable,
} from "./airtable";
import {
  AIRTABLE_ENTERED_BY,
  airtableCellToString,
  decideFieldSync,
  decideTeacherSync,
} from "./airtable-merge";
import { normalizeEmail } from "./answers";
import { airtableSyncAllowed, environmentName } from "./environment";
import { logger } from "./logger";
import { parseTeachers } from "./parse-teachers";
import { saveSetting, settingValue } from "./settings";

export const AIRTABLE_SYNC_KEY = "airtable_sync";
/** A run older than this is assumed crashed and its claim can be taken over. */
const STALE_RUN_MS = 10 * 60 * 1000;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The simple one-field questions that sync both ways. */
const SIMPLE_SYNC_FIELDS: ReadonlyArray<{ questionKey: string; fieldId: string }> = [
  { questionKey: "workshop_time", fieldId: AIRTABLE_FIELDS.workshopTime },
  { questionKey: "activity_area", fieldId: AIRTABLE_FIELDS.activityArea },
  { questionKey: "speaker_area", fieldId: AIRTABLE_FIELDS.speakerArea },
];

export type AirtableSyncStatus = {
  runningSince: string | null;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncMessage: string | null;
};

export async function getAirtableSyncStatus(): Promise<AirtableSyncStatus> {
  const raw = await settingValue(AIRTABLE_SYNC_KEY);
  const out: AirtableSyncStatus = {
    runningSince: null,
    lastSyncAt: null,
    lastSyncOk: null,
    lastSyncMessage: null,
  };
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Partial<AirtableSyncStatus>;
    const running = typeof parsed.runningSince === "string" ? parsed.runningSince : null;
    // A claim older than the stale window is a crashed run, not a live one.
    out.runningSince =
      running && Date.now() - new Date(running).getTime() < STALE_RUN_MS ? running : null;
    out.lastSyncAt = typeof parsed.lastSyncAt === "string" ? parsed.lastSyncAt : null;
    out.lastSyncOk = typeof parsed.lastSyncOk === "boolean" ? parsed.lastSyncOk : null;
    out.lastSyncMessage = typeof parsed.lastSyncMessage === "string" ? parsed.lastSyncMessage : null;
  } catch {
    // malformed status — treat as never synced
  }
  return out;
}

/**
 * Atomically claim a sync run: exactly one caller gets true while a run is
 * in flight (claims older than the stale window can be taken over).
 */
async function claimSyncRun(nowIso: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const fresh = JSON.stringify({
    runningSince: nowIso,
    lastSyncAt: null,
    lastSyncOk: null,
    lastSyncMessage: null,
  });
  const result = await db.execute(sql`
    insert into app_settings (key, value)
    values (${AIRTABLE_SYNC_KEY}, ${fresh})
    on conflict (key) do update set
      value = jsonb_set(app_settings.value::jsonb, '{runningSince}', to_jsonb(${nowIso}::text))::text,
      updated_at = now()
    where app_settings.value::jsonb->>'runningSince' is null
       or app_settings.value::jsonb->>'runningSince' < ${staleBefore}
  `);
  return (result.rowCount ?? 0) > 0;
}

async function finishSyncRun(ok: boolean, message: string): Promise<void> {
  await saveSetting(
    AIRTABLE_SYNC_KEY,
    JSON.stringify({
      runningSince: null,
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: ok,
      lastSyncMessage: message,
    } satisfies AirtableSyncStatus),
  );
}

export type SyncRunResult = {
  ok: boolean;
  /** Another run already holds the claim; nothing was done. */
  busy: boolean;
  /** The connector is not available in this environment; nothing was done. */
  skipped: boolean;
  /** True when the run created/updated/pulled/pushed anything. */
  changed: boolean;
  message: string;
};

/** Run one full sync pass now (used by the scheduler and by "Sync now"). */
export async function runAirtableSyncNow(): Promise<SyncRunResult> {
  if (!airtableSyncAllowed()) {
    // Dev is isolated from Airtable by default; only production syncs
    // (AIRTABLE_SYNC_DEV_OVERRIDE=true deliberately re-enables it in dev).
    return {
      ok: false,
      busy: false,
      skipped: true,
      changed: false,
      message: `Airtable sync is disabled in ${environmentName()}; only production syncs.`,
    };
  }
  if (!isAirtableConfigured()) {
    return {
      ok: false,
      busy: false,
      skipped: true,
      changed: false,
      message: "Airtable connection not available in this environment.",
    };
  }
  const nowIso = new Date().toISOString();
  if (!(await claimSyncRun(nowIso))) {
    return { ok: false, busy: true, skipped: false, changed: false, message: "A sync is already running." };
  }
  try {
    const counters = await pullAndReconcile();
    const parts = [
      `checked ${counters.checked} future workshop(s)`,
      `${counters.created} school(s) added`,
      `${counters.datesUpdated} date update(s)`,
      `${counters.contactsChanged} contact change(s)`,
      `${counters.answersPulled} change(s) pulled from Airtable`,
      `${counters.fieldsPushed} field(s) pushed to Airtable`,
    ];
    if (counters.errors > 0) parts.push(`${counters.errors} record(s) failed`);
    const message = `Synced: ${parts.join(", ")}.`;
    const ok = counters.errors === 0;
    await finishSyncRun(ok, message);
    const changed =
      counters.created + counters.datesUpdated + counters.contactsChanged +
        counters.answersPulled + counters.fieldsPushed >
      0;
    return { ok, busy: false, skipped: false, changed, message };
  } catch (err) {
    const message = `Sync failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.error({ err }, "[airtable] sync failed");
    try {
      await finishSyncRun(false, message);
    } catch {
      // status write failed too; the stale-claim window will free the lock
    }
    return { ok: false, busy: false, skipped: false, changed: false, message };
  }
}

// --- the pull itself ---

type Counters = {
  checked: number;
  created: number;
  datesUpdated: number;
  contactsChanged: number;
  answersPulled: number;
  fieldsPushed: number;
  errors: number;
};

type AirtableRecord = { id: string; fields: Record<string, unknown> };

async function listAllRecords(tableId: string, params: URLSearchParams): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const page = new URLSearchParams(params);
    if (offset) page.set("offset", offset);
    const res = await airtableRequest(`/v0/${AIRTABLE_BASE_ID}/${tableId}?${page.toString()}`);
    if (!res.ok) {
      throw new Error(`Airtable list failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { records: AirtableRecord[]; offset?: string };
    out.push(...data.records);
    offset = data.offset;
  } while (offset);
  return out;
}

async function fetchFutureWorkshops(): Promise<AirtableRecord[]> {
  const params = new URLSearchParams({
    returnFieldsByFieldId: "true",
    pageSize: "100",
    // Calendar-date comparison; only future workshops are ever synced.
    filterByFormula: "IS_AFTER({Workshop Date}, TODAY())",
  });
  for (const fieldId of new Set(Object.values(AIRTABLE_FIELDS))) {
    params.append("fields[]", fieldId);
  }
  return listAllRecords(WORKSHOPS_TABLE_ID, params);
}

/** Contact record id → contact name, from the School Contacts table (read-only). */
async function fetchContactNameMap(): Promise<Map<string, string>> {
  const params = new URLSearchParams({ returnFieldsByFieldId: "true", pageSize: "100" });
  params.append("fields[]", CONTACT_NAME_FIELD_ID);
  const records = await listAllRecords(CONTACTS_TABLE_ID, params);
  const map = new Map<string, string>();
  for (const rec of records) {
    const name = airtableCellToString(rec.fields[CONTACT_NAME_FIELD_ID]);
    if (name) map.set(rec.id, name);
  }
  return map;
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

type PulledContact = { email: string; name: string | null };

/** Emails/names/titles are parallel lookup arrays — pair them by position. */
function extractContacts(
  fields: Record<string, unknown>,
  nameMap: Map<string, string>,
): PulledContact[] {
  const emails = asArray(fields[AIRTABLE_FIELDS.contactEmails]);
  const nameIds = asArray(fields[AIRTABLE_FIELDS.contactNames]);
  const titles = asArray(fields[AIRTABLE_FIELDS.contactTitles]);
  const out: PulledContact[] = [];
  const seen = new Set<string>();
  emails.forEach((rawEmail, i) => {
    const email = String(rawEmail ?? "").trim();
    if (!email.includes("@") || seen.has(normalizeEmail(email))) return;
    seen.add(normalizeEmail(email));
    const baseName = nameMap.get(String(nameIds[i] ?? "")) ?? "";
    const title = String(titles[i] ?? "").trim();
    const name = baseName ? (title ? `${baseName} (${title})` : baseName) : null;
    out.push({ email, name });
  });
  return out;
}

function randomCode(): string {
  return crypto
    .randomBytes(8)
    .toString("base64url")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
}

async function generateUniqueCode(): Promise<string> {
  for (;;) {
    const code = randomCode();
    if (code.length < 8) continue;
    const [existing] = await db
      .select({ id: schoolsTable.id })
      .from(schoolsTable)
      .where(eq(schoolsTable.code, code));
    if (!existing) return code;
  }
}

/** The latest history entry a sync decision is based on (null = none yet). */
export type SeenEntry = { enteredAt: Date; id: number } | null;

async function latestAnswer(
  schoolId: number,
  questionKey: string,
): Promise<{ value: string; seen: SeenEntry }> {
  const [row] = await db
    .select({ id: answersTable.id, value: answersTable.value, enteredAt: answersTable.enteredAt })
    .from(answersTable)
    .where(and(eq(answersTable.schoolId, schoolId), eq(answersTable.questionKey, questionKey)))
    .orderBy(desc(answersTable.enteredAt), desc(answersTable.id))
    .limit(1);
  return {
    value: (row?.value ?? "").trim(),
    seen: row ? { enteredAt: row.enteredAt, id: row.id } : null,
  };
}

/**
 * Append an Airtable-sourced answer, but ONLY if the school's answer for
 * that question has not changed since the sync read it (`seen`). The check
 * and the insert are one conditional statement, so a portal save that lands
 * in between makes this a no-op — the portal's newer value stays latest and
 * the next pass re-decides (portal wins). An amend-in-place also bumps
 * entered_at on the same row, so it trips the guard too.
 *
 * Returns false when the insert was skipped.
 */
export async function insertAnswerFromAirtable(
  schoolId: number,
  questionKey: string,
  value: string,
  seen: SeenEntry,
): Promise<boolean> {
  // Postgres keeps microseconds but a JS Date only carries milliseconds, so
  // the comparison truncates the column to milliseconds too — otherwise the
  // seen row itself would look "newer" than its own snapshot.
  const changedSince = seen
    ? sql`(date_trunc('milliseconds', a.entered_at), a.id) > (${seen.enteredAt}::timestamptz, ${seen.id}::int)`
    : sql`true`;
  const result = await db.execute(sql`
    insert into answers (school_id, question_key, value, entered_by)
    select ${schoolId}, ${questionKey}, ${value}, ${AIRTABLE_ENTERED_BY}
    where not exists (
      select 1 from answers a
      where a.school_id = ${schoolId}
        and a.question_key = ${questionKey}
        and ${changedSince}
    )
  `);
  return (result.rowCount ?? 0) > 0;
}

/** Same stale-snapshot guard as insertAnswerFromAirtable, for teacher lists. */
export async function insertTeacherSnapshotFromAirtable(
  schoolId: number,
  rows: unknown[],
  totalStudents: number,
  seen: SeenEntry,
): Promise<boolean> {
  // Millisecond truncation for the same reason as insertAnswerFromAirtable.
  const changedSince = seen
    ? sql`(date_trunc('milliseconds', t.entered_at), t.id) > (${seen.enteredAt}::timestamptz, ${seen.id}::int)`
    : sql`true`;
  const result = await db.execute(sql`
    insert into teacher_snapshots (school_id, rows, total_students, entered_by)
    select ${schoolId}, ${JSON.stringify(rows)}::jsonb, ${totalStudents}, ${AIRTABLE_ENTERED_BY}
    where not exists (
      select 1 from teacher_snapshots t
      where t.school_id = ${schoolId}
        and ${changedSince}
    )
  `);
  return (result.rowCount ?? 0) > 0;
}

/** Merge the per-field baseline and replace the contact-email baseline. */
async function saveSyncState(
  schoolId: number,
  fieldPatch: Record<string, string>,
  contactEmails: string[],
): Promise<void> {
  await db.execute(sql`
    update schools
    set airtable_sync_state = jsonb_build_object(
      'fields',
      coalesce(airtable_sync_state->'fields', '{}'::jsonb) || ${JSON.stringify(fieldPatch)}::jsonb,
      'contactEmails',
      ${JSON.stringify(contactEmails)}::jsonb
    )
    where id = ${schoolId}
  `);
}

async function pullAndReconcile(): Promise<Counters> {
  const counters: Counters = {
    checked: 0,
    created: 0,
    datesUpdated: 0,
    contactsChanged: 0,
    answersPulled: 0,
    fieldsPushed: 0,
    errors: 0,
  };

  const records = await fetchFutureWorkshops();
  counters.checked = records.length;
  if (records.length === 0) return counters;

  const nameMap = await fetchContactNameMap();
  const schools = await db.select().from(schoolsTable);
  const byRecordId = new Map<string, School>();
  for (const school of schools) {
    if (school.airtableRecordId) byRecordId.set(school.airtableRecordId, school);
  }

  for (const rec of records) {
    try {
      const school = byRecordId.get(rec.id);
      if (!school) {
        await createSchoolFromRecord(rec, nameMap, counters);
      } else {
        await reconcileSchool(school, rec, nameMap, counters);
      }
    } catch (err) {
      counters.errors += 1;
      logger.error({ err, airtableRecordId: rec.id }, "[airtable] record sync failed");
    }
  }
  return counters;
}

async function createSchoolFromRecord(
  rec: AirtableRecord,
  nameMap: Map<string, string>,
  counters: Counters,
): Promise<void> {
  const f = rec.fields;
  const name = airtableCellToString(f[AIRTABLE_FIELDS.schoolName]);
  const workshopDate = airtableCellToString(f[AIRTABLE_FIELDS.workshopDate]);
  const approxStudents = airtableCellToString(f[AIRTABLE_FIELDS.totalStudentCount]);
  const workshopTime = airtableCellToString(f[AIRTABLE_FIELDS.workshopTime]);
  const activityArea = airtableCellToString(f[AIRTABLE_FIELDS.activityArea]);
  const speakerArea = airtableCellToString(f[AIRTABLE_FIELDS.speakerArea]);
  const teacherNames = airtableCellToString(f[AIRTABLE_FIELDS.teacherNamesWithCounts]);
  const teacherEmails = airtableCellToString(f[AIRTABLE_FIELDS.teacherEmails]);
  const contacts = extractContacts(f, nameMap);

  const [created] = await db
    .insert(schoolsTable)
    .values({
      name: name || "Unnamed school",
      code: await generateUniqueCode(),
      workshopDate: DATE_ONLY.test(workshopDate) ? workshopDate : null,
      airtableRecordId: rec.id,
      approxStudents: approxStudents || null,
      airtableSyncState: {
        fields: {
          [AIRTABLE_FIELDS.workshopTime]: workshopTime,
          [AIRTABLE_FIELDS.activityArea]: activityArea,
          [AIRTABLE_FIELDS.speakerArea]: speakerArea,
          [AIRTABLE_FIELDS.teacherNamesWithCounts]: teacherNames,
          [AIRTABLE_FIELDS.teacherEmails]: teacherEmails,
        },
        contactEmails: contacts.map((c) => c.email),
      },
    })
    // A concurrent run may have just created it; that run owns the rest.
    .onConflictDoNothing({ target: schoolsTable.airtableRecordId })
    .returning();
  if (!created) return;

  if (contacts.length > 0) {
    await db
      .insert(contactsTable)
      .values(contacts.map((c) => ({ schoolId: created.id, email: c.email, name: c.name })));
  }

  const startingAnswers = [
    { questionKey: "workshop_time", value: workshopTime },
    { questionKey: "activity_area", value: activityArea },
    { questionKey: "speaker_area", value: speakerArea },
  ].filter((a) => a.value !== "");
  if (startingAnswers.length > 0) {
    await db.insert(answersTable).values(
      startingAnswers.map((a) => ({
        schoolId: created.id,
        questionKey: a.questionKey,
        value: a.value,
        enteredBy: AIRTABLE_ENTERED_BY,
      })),
    );
  }

  if (teacherNames !== "" || teacherEmails !== "") {
    const { rows, total } = parseTeachers(teacherNames || null, teacherEmails || null);
    if (rows.length > 0) {
      await db.insert(teacherSnapshotsTable).values({
        schoolId: created.id,
        rows,
        totalStudents: total,
        enteredBy: AIRTABLE_ENTERED_BY,
      });
    }
  }

  counters.created += 1;
  logger.info(
    { schoolId: created.id, airtableRecordId: rec.id, name: created.name },
    "[airtable] created school from new workshop record",
  );
}

async function reconcileSchool(
  school: School,
  rec: AirtableRecord,
  nameMap: Map<string, string>,
  counters: Counters,
): Promise<void> {
  const f = rec.fields;
  const state = school.airtableSyncState;
  const fieldPatch: Record<string, string> = {};
  const pushFields: Record<string, string | number> = {};

  // Workshop date: pull-only, Airtable wins. Bare YYYY-MM-DD in, bare out —
  // never parsed through a timezone.
  const workshopDate = airtableCellToString(f[AIRTABLE_FIELDS.workshopDate]);
  if (DATE_ONLY.test(workshopDate) && workshopDate !== school.workshopDate) {
    await db
      .update(schoolsTable)
      .set({ workshopDate })
      .where(eq(schoolsTable.id, school.id));
    counters.datesUpdated += 1;
  }

  // Contacts: pull-only. Additions and renames always apply; a contact is
  // removed only when it came from Airtable (in the last-synced list) and
  // has now disappeared there — contacts added in the app are never touched.
  const airtableContacts = extractContacts(f, nameMap);
  const existingContacts = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.schoolId, school.id));
  const desired = new Map(airtableContacts.map((c) => [normalizeEmail(c.email), c]));
  const lastSynced = new Set((state?.contactEmails ?? []).map((e) => normalizeEmail(e)));
  for (const [key, contact] of desired) {
    const existing = existingContacts.find((c) => normalizeEmail(c.email) === key);
    if (!existing) {
      await db
        .insert(contactsTable)
        .values({ schoolId: school.id, email: contact.email, name: contact.name });
      counters.contactsChanged += 1;
    } else if (contact.name && existing.name !== contact.name) {
      await db
        .update(contactsTable)
        .set({ name: contact.name })
        .where(eq(contactsTable.id, existing.id));
      counters.contactsChanged += 1;
    }
  }
  for (const existing of existingContacts) {
    const key = normalizeEmail(existing.email);
    if (!desired.has(key) && lastSynced.has(key)) {
      await db.delete(contactsTable).where(eq(contactsTable.id, existing.id));
      counters.contactsChanged += 1;
    }
  }

  // Simple answer fields, both ways.
  for (const { questionKey, fieldId } of SIMPLE_SYNC_FIELDS) {
    const airtableValue = airtableCellToString(f[fieldId]);
    const { value: portalValue, seen } = await latestAnswer(school.id, questionKey);
    const decision = decideFieldSync({
      last: state?.fields?.[fieldId],
      airtable: airtableValue,
      portal: portalValue,
    });
    if (decision.action === "pull") {
      const inserted = await insertAnswerFromAirtable(school.id, questionKey, airtableValue, seen);
      if (inserted) {
        counters.answersPulled += 1;
        fieldPatch[fieldId] = decision.nextLast;
      }
      // else: a portal save landed mid-run. The baseline stays put, so the
      // next pass sees "portal changed" and pushes the portal's value.
    } else if (decision.action === "push") {
      pushFields[fieldId] = portalValue;
    } else {
      fieldPatch[fieldId] = decision.nextLast;
    }
  }

  // Teachers: one answer in the app, two fields in Airtable — decided as a pair.
  const airtableNames = airtableCellToString(f[AIRTABLE_FIELDS.teacherNamesWithCounts]);
  const airtableEmails = airtableCellToString(f[AIRTABLE_FIELDS.teacherEmails]);
  const [snapshot] = await db
    .select()
    .from(teacherSnapshotsTable)
    .where(eq(teacherSnapshotsTable.schoolId, school.id))
    .orderBy(desc(teacherSnapshotsTable.enteredAt), desc(teacherSnapshotsTable.id))
    .limit(1);
  // Trimmed like every other compared value — rows without an email produce
  // leading/trailing blank lines, and the stored baseline is trimmed, so an
  // untrimmed compare here would re-push the same records forever.
  const portalNames = snapshot ? formatTeacherNames(snapshot.rows).trim() : "";
  const portalEmails = snapshot ? formatTeacherEmails(snapshot.rows).trim() : "";
  const teacherAction = decideTeacherSync({
    lastNames: state?.fields?.[AIRTABLE_FIELDS.teacherNamesWithCounts],
    lastEmails: state?.fields?.[AIRTABLE_FIELDS.teacherEmails],
    airtableNames,
    airtableEmails,
    portalNames,
    portalEmails,
  });
  if (teacherAction === "pull") {
    const { rows, total } = parseTeachers(airtableNames || null, airtableEmails || null);
    const inserted = await insertTeacherSnapshotFromAirtable(
      school.id,
      rows,
      total,
      snapshot ? { enteredAt: snapshot.enteredAt, id: snapshot.id } : null,
    );
    if (inserted) {
      counters.answersPulled += 1;
      fieldPatch[AIRTABLE_FIELDS.teacherNamesWithCounts] = airtableNames;
      fieldPatch[AIRTABLE_FIELDS.teacherEmails] = airtableEmails;
    }
    // else: a portal teacher save landed mid-run; portal wins next pass.
  } else if (teacherAction === "push") {
    pushFields[AIRTABLE_FIELDS.teacherNamesWithCounts] = portalNames;
    pushFields[AIRTABLE_FIELDS.teacherEmails] = portalEmails;
    pushFields[AIRTABLE_FIELDS.totalStudentCount] = snapshot?.totalStudents ?? 0;
  } else {
    fieldPatch[AIRTABLE_FIELDS.teacherNamesWithCounts] = portalNames;
    fieldPatch[AIRTABLE_FIELDS.teacherEmails] = portalEmails;
  }

  // Push the portal-won fields back to Airtable. On success this also
  // advances their last-synced baseline (writeAnswersToAirtable does it);
  // on failure the baseline stays put and the next pass retries.
  if (Object.keys(pushFields).length > 0) {
    const pushed = await writeAnswersToAirtable(rec.id, pushFields);
    if (pushed) {
      counters.fieldsPushed += Object.keys(pushFields).length;
    } else {
      counters.errors += 1;
    }
  }

  await saveSyncState(school.id, fieldPatch, airtableContacts.map((c) => c.email));
}
