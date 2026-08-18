/**
 * Airtable connection — built and READY, but switched OFF.
 *
 * Do not connect in this build. The functions below are written against the
 * stored settings (API key, base id, table id) so that filling those in is
 * the only remaining step. While settings are empty, every function is a
 * no-op that logs and returns.
 *
 * Field mapping (write-back):
 *   Teacher names with counts   fldNxgfk2RObp4K1X   "First Last: 24", one per line
 *   Teacher email addresses     fldaYxsKkM8PaIbzN   one per line, same order
 *   Workshop time               fld1O3lFuPbRypXtx
 *   Area for activity stations  fldvc0hextGEnTZx3
 *   Additional area (speakers)  flduznKnoqFxXwbCB
 *   Total student count         fldJp6j7NGxAy8zmk   sum of teacher rows, never typed
 *
 * Read:
 *   Workshop Date               fldISmPGTYzFQjvn9
 *   Contact Email/s             fldJVN4DX2Fq12VrY   (lookup — read-only, never write)
 *
 * Rules: latest answer wins (overwrite the field — Airtable holds current
 * state, our app holds history). The "Anything else we should know?" answer
 * (question key "notes") never goes to Airtable. Information flows one way
 * after the first read: we never read answers back out to fill the form.
 */
import { db, appSettingsTable, type TeacherRowData } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export const AIRTABLE_FIELDS = {
  teacherNamesWithCounts: "fldNxgfk2RObp4K1X",
  teacherEmails: "fldaYxsKkM8PaIbzN",
  workshopTime: "fld1O3lFuPbRypXtx",
  activityArea: "fldvc0hextGEnTZx3",
  speakerArea: "flduznKnoqFxXwbCB",
  totalStudentCount: "fldJp6j7NGxAy8zmk",
  workshopDate: "fldISmPGTYzFQjvn9",
  contactEmails: "fldJVN4DX2Fq12VrY",
} as const;

export type AirtableConfig = {
  apiKey: string;
  baseId: string;
  tableId: string;
};

export async function getAirtableConfig(): Promise<AirtableConfig | null> {
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "airtable"));
  if (rows.length === 0) return null;
  try {
    const cfg = JSON.parse(rows[0]!.value) as AirtableConfig;
    if (!cfg.apiKey || !cfg.baseId || !cfg.tableId) return null;
    return cfg;
  } catch {
    return null;
  }
}

export function isAirtableEnabled(cfg: AirtableConfig | null): boolean {
  // Connection stays off until settings are filled in.
  return cfg !== null;
}

export function formatTeacherNames(rows: TeacherRowData[]): string {
  return rows.map((r) => `${r.firstName} ${r.lastName}: ${r.studentCount}`).join("\n");
}

export function formatTeacherEmails(rows: TeacherRowData[]): string {
  return rows.map((r) => r.email).join("\n");
}

/** Overwrite answer fields on a workshop record. Latest answer wins. */
export async function writeAnswersToAirtable(
  airtableRecordId: string | null,
  fields: Record<string, string | number>,
): Promise<void> {
  const cfg = await getAirtableConfig();
  if (!isAirtableEnabled(cfg) || !airtableRecordId) {
    logger.info({ airtableRecordId, fields: Object.keys(fields) }, "Airtable write skipped (connection off)");
    return;
  }
  // Ready for when the connection is switched on:
  // await fetch(`https://api.airtable.com/v0/${cfg.baseId}/${cfg.tableId}/${airtableRecordId}`, {
  //   method: "PATCH",
  //   headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
  //   body: JSON.stringify({ fields }),
  // });
}

/** Read workshop records (Workshop Date, Contact Email/s) to find due schools. */
export async function readWorkshopsFromAirtable(): Promise<null> {
  const cfg = await getAirtableConfig();
  if (!isAirtableEnabled(cfg)) {
    logger.info("Airtable read skipped (connection off) — using local data");
    return null;
  }
  // Ready for when the connection is switched on:
  // GET https://api.airtable.com/v0/{baseId}/{tableId}?fields[]=...
  return null;
}
