/**
 * Airtable connection — LIVE, authenticated through the Replit Airtable
 * connection (no stored API key; Admin Settings only shows status).
 *
 * The Workshops table is the only data source. The School Contacts table
 * is read ONLY to resolve contact record ids to names (the Workshops
 * "Contact Name/s" lookup returns record ids, not names).
 *
 * Field mapping (write-back):
 *   Teacher names with counts   fldNxgfk2RObp4K1X   "First Last: 24", one per line
 *   Teacher email addresses     fldaYxsKkM8PaIbzN   one per line, same order
 *   Workshop time               fld1O3lFuPbRypXtx
 *   Area for activity stations  fldvc0hextGEnTZx3
 *   Additional area (speakers)  flduznKnoqFxXwbCB
 *   Total student count         fldJp6j7NGxAy8zmk   sum of teacher rows, never typed
 *
 * Read (pull sync):
 *   Workshop Date               fldISmPGTYzFQjvn9   bare YYYY-MM-DD calendar date
 *   School name                 fldw8YvMQ1FcU2eZQ   "School (reformat)" formula
 *   Contact Email/s             fldJVN4DX2Fq12VrY   (lookup — read-only, never write)
 *   Contact Name/s              fldLrJ3xsU7j4W7CR   (lookup — returns RECORD IDS)
 *   Contact Title               fldi8lltWLsExg41S   (lookup — titles, pairs by index)
 *
 * Rules: latest answer wins (overwrite the field — Airtable holds current
 * state, our app holds history). The "Anything else we should know?" answer
 * (question key "notes") never goes to Airtable. When both sides changed the
 * same field between syncs, the portal wins (see airtable-sync.ts).
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import { sql } from "drizzle-orm";
import { db, type TeacherRowData } from "@workspace/db";
import { logger } from "./logger";

export const AIRTABLE_BASE_ID = "app9RGanaWFp0BpLh";
export const WORKSHOPS_TABLE_ID = "tblB8D1tEyxY30LO8";
/** Read ONLY to resolve contact record ids to names — never a data source. */
export const CONTACTS_TABLE_ID = "tbldPXXbTCSn9aaSH";

export const AIRTABLE_FIELDS = {
  teacherNamesWithCounts: "fldNxgfk2RObp4K1X",
  teacherEmails: "fldaYxsKkM8PaIbzN",
  workshopTime: "fld1O3lFuPbRypXtx",
  activityArea: "fldvc0hextGEnTZx3",
  speakerArea: "flduznKnoqFxXwbCB",
  totalStudentCount: "fldJp6j7NGxAy8zmk",
  workshopDate: "fldISmPGTYzFQjvn9",
  schoolName: "fldw8YvMQ1FcU2eZQ",
  contactEmails: "fldJVN4DX2Fq12VrY",
  contactNames: "fldLrJ3xsU7j4W7CR",
  contactTitles: "fldi8lltWLsExg41S",
} as const;

/** "🔹Contact Name" on the School Contacts table (name resolution only). */
export const CONTACT_NAME_FIELD_ID = "fldEPUOhdcoxZ5zaO";

/**
 * True when the Replit connector infrastructure is available to this
 * process (dev workspace and deployments both have it; plain shells and
 * test runs may not).
 */
export function isAirtableConfigured(): boolean {
  return Boolean(
    process.env["REPLIT_CONNECTORS_HOSTNAME"] &&
      (process.env["REPL_IDENTITY"] || process.env["WEB_REPL_RENEWAL"]),
  );
}

/**
 * One authenticated Airtable REST call through the Replit connection.
 * Paths are relative to https://api.airtable.com. A fresh client per call
 * lets the SDK refresh short-lived tokens itself.
 */
export async function airtableRequest(
  path: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<Response> {
  const connectors = new ReplitConnectors();
  return await connectors.proxy("airtable", path, init);
}

/** Live check that the Airtable connection can actually authenticate. */
export async function checkAirtableConnection(): Promise<boolean> {
  if (!isAirtableConfigured()) return false;
  try {
    const res = await airtableRequest("/v0/meta/whoami");
    return res.ok;
  } catch (err) {
    logger.error({ err }, "Airtable connection check failed");
    return false;
  }
}

export function formatTeacherNames(rows: TeacherRowData[]): string {
  return rows.map((r) => `${r.firstName} ${r.lastName}: ${r.studentCount}`).join("\n");
}

export function formatTeacherEmails(rows: TeacherRowData[]): string {
  return rows.map((r) => r.email).join("\n");
}

/**
 * Overwrite answer fields on a workshop record. Latest answer wins.
 *
 * Never throws and never blocks the caller's save: on any failure it logs
 * and returns false, and the next scheduled sync pass reconciles (the
 * per-field last-synced state below is only advanced on SUCCESS, so an
 * unsynced portal change keeps looking like "portal changed" to the sync).
 */
export async function writeAnswersToAirtable(
  airtableRecordId: string | null,
  fields: Record<string, string | number>,
): Promise<boolean> {
  if (!airtableRecordId || Object.keys(fields).length === 0) return false;
  if (!isAirtableConfigured()) {
    logger.info(
      { airtableRecordId, fields: Object.keys(fields) },
      "Airtable write skipped (connection not available)",
    );
    return false;
  }
  // Every mapped Workshops column is a text field, and Airtable's text
  // fields reject raw numbers even with typecast — so everything goes out
  // as a string (e.g. the numeric student total).
  const outFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) outFields[key] = String(value);
  try {
    const res = await airtableRequest(
      `/v0/${AIRTABLE_BASE_ID}/${WORKSHOPS_TABLE_ID}/${airtableRecordId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: outFields, typecast: true }),
      },
    );
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      logger.error(
        { airtableRecordId, status: res.status, body },
        "Airtable write failed; next sync will retry",
      );
      return false;
    }
    await rememberSyncedFields(airtableRecordId, fields);
    return true;
  } catch (err) {
    logger.error({ err, airtableRecordId }, "Airtable write failed; next sync will retry");
    return false;
  }
}

/**
 * After a successful push, record the pushed values as the new per-field
 * last-synced baseline so the next pull knows Airtable and the portal agree.
 * jsonb merge, so a concurrent sync writing other fields is never clobbered.
 */
async function rememberSyncedFields(
  airtableRecordId: string,
  fields: Record<string, string | number>,
): Promise<void> {
  const asStrings: Record<string, string> = {};
  // Trimmed, because the sync compares trimmed values on both sides.
  for (const [key, value] of Object.entries(fields)) asStrings[key] = String(value).trim();
  try {
    await db.execute(sql`
      update schools
      set airtable_sync_state = jsonb_build_object(
        'fields',
        coalesce(airtable_sync_state->'fields', '{}'::jsonb) || ${JSON.stringify(asStrings)}::jsonb,
        'contactEmails',
        coalesce(airtable_sync_state->'contactEmails', '[]'::jsonb)
      )
      where airtable_record_id = ${airtableRecordId}
    `);
  } catch (err) {
    // Harmless: the field will look "portal-changed" to the next sync,
    // which re-pushes the same value.
    logger.error({ err, airtableRecordId }, "Could not record Airtable sync state");
  }
}
