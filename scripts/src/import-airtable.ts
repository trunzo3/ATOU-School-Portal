/**
 * Replace all school + contact data with the payload pulled from the
 * Airtable Workshops table (scripts/src/airtable-import.json).
 *
 * DESTRUCTIVE: wipes schools, contacts, answers, and teacher snapshots,
 * then inserts one school row per upcoming workshop, keyed to its Airtable
 * workshop record id for future write-back.
 *
 * Run: pnpm --filter @workspace/scripts run import-airtable
 */
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  db,
  pool,
  answersTable,
  contactsTable,
  schoolsTable,
  teacherSnapshotsTable,
} from "@workspace/db";

type ImportSchool = {
  airtableRecordId: string;
  name: string;
  workshopDate: string | null;
  approxStudents?: string | null;
  contacts: { email: string; name: string | null }[];
};

function randomCode(): string {
  // 10 lowercase alphanumeric chars, unguessable enough for a private link
  return crypto.randomBytes(8).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
}

async function main() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "airtable-import.json");
  const schools = JSON.parse(readFileSync(file, "utf8")) as ImportSchool[];

  await db.delete(teacherSnapshotsTable);
  await db.delete(answersTable);
  await db.delete(contactsTable);
  await db.delete(schoolsTable);

  const codes = new Set<string>();
  for (const s of schools) {
    let code = randomCode();
    while (codes.has(code) || code.length < 8) code = randomCode();
    codes.add(code);

    const [row] = await db
      .insert(schoolsTable)
      .values({
        name: s.name,
        code,
        workshopDate: s.workshopDate,
        airtableRecordId: s.airtableRecordId,
        approxStudents: s.approxStudents ?? null,
      })
      .returning();
    if (s.contacts.length > 0) {
      await db
        .insert(contactsTable)
        .values(s.contacts.map((c) => ({ schoolId: row!.id, email: c.email, name: c.name })));
    }
  }
  console.log(`Imported ${schools.length} schools from Airtable Workshops.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
