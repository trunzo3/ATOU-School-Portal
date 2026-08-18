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
import { parseTeachers } from "./parse-workshop-answers";

export type ImportSchool = {
  airtableRecordId: string;
  name: string;
  workshopDate: string | null;
  approxStudents?: string | null;
  contacts: { email: string; name: string | null }[];
  // Values already typed into the Workshops sheet, imported as the
  // starting answers (entered by "Airtable import").
  answers?: {
    workshopTime?: string | null;
    activityArea?: string | null;
    speakerArea?: string | null;
    teacherNames?: string | null;
    teacherEmails?: string | null;
  };
};

export const IMPORT_ENTERED_BY = "Airtable import";

/** Insert answers/teacher snapshot carried over from the Workshops sheet. */
export async function insertImportedAnswers(
  schoolId: number,
  answers: NonNullable<ImportSchool["answers"]>,
): Promise<void> {
  const simple: [string, string | null | undefined][] = [
    ["workshop_time", answers.workshopTime],
    ["activity_area", answers.activityArea],
    ["speaker_area", answers.speakerArea],
  ];
  for (const [questionKey, value] of simple) {
    if (!value || !value.trim()) continue;
    await db.insert(answersTable).values({
      schoolId,
      questionKey,
      value: value.trim(),
      enteredBy: IMPORT_ENTERED_BY,
    });
  }
  if (answers.teacherNames && answers.teacherNames.trim()) {
    const { rows, total } = parseTeachers(answers.teacherNames, answers.teacherEmails ?? null);
    if (rows.length > 0) {
      await db.insert(teacherSnapshotsTable).values({
        schoolId,
        rows,
        totalStudents: total,
        enteredBy: IMPORT_ENTERED_BY,
      });
    }
  }
}

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
    if (s.answers) await insertImportedAnswers(row!.id, s.answers);
  }
  console.log(`Imported ${schools.length} schools from Airtable Workshops.`);
}

// Only run when executed directly (this module is also imported for its helpers).
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
