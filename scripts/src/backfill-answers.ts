/**
 * One-off: copy the answers already typed into the Workshops sheet
 * (from airtable-import.json) onto the existing school rows, without
 * touching schools/contacts/codes. Skips any school that already has
 * answers or a teacher snapshot in the app.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "@workspace/db";
import { insertImportedAnswers, type ImportSchool } from "./import-airtable";

async function main() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "airtable-import.json");
  const schools = JSON.parse(readFileSync(file, "utf8")) as ImportSchool[];
  let updated = 0;
  for (const s of schools) {
    const a = s.answers;
    if (!a || !(a.workshopTime || a.activityArea || a.speakerArea || a.teacherNames)) continue;
    const res = await pool.query(
      "SELECT id FROM schools WHERE airtable_record_id = $1",
      [s.airtableRecordId],
    );
    const schoolId = res.rows[0]?.id as number | undefined;
    if (!schoolId) continue;
    const existing = await pool.query(
      `SELECT (SELECT COUNT(*) FROM answers WHERE school_id = $1)::int
            + (SELECT COUNT(*) FROM teacher_snapshots WHERE school_id = $1)::int AS n`,
      [schoolId],
    );
    if (existing.rows[0].n > 0) {
      console.log(`skip (already has answers): ${s.name}`);
      continue;
    }
    await insertImportedAnswers(schoolId, a);
    updated += 1;
  }
  console.log(`Copied sheet answers onto ${updated} schools.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
