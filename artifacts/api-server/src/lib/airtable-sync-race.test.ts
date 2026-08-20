/**
 * Integration tests (real database) for the stale-snapshot guards that keep
 * a sync pass from overwriting a newer portal answer: the pull insert only
 * lands if the school's answer is still exactly what the sync read when it
 * made its decision. A portal save (or an amend-in-place) that happens
 * between the sync's read and its write must turn the pull into a no-op.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  pool,
  answersTable,
  schoolsTable,
  teacherSnapshotsTable,
} from "@workspace/db";
import crypto from "node:crypto";
import {
  insertAnswerFromAirtable,
  insertTeacherSnapshotFromAirtable,
  type SeenEntry,
} from "./airtable-sync";
import { AIRTABLE_ENTERED_BY } from "./airtable-merge";

let schoolId: number;

async function latest(questionKey: string) {
  const [row] = await db
    .select()
    .from(answersTable)
    .where(and(eq(answersTable.schoolId, schoolId), eq(answersTable.questionKey, questionKey)))
    .orderBy(desc(answersTable.enteredAt), desc(answersTable.id))
    .limit(1);
  return row ?? null;
}

function asSeen(row: { enteredAt: Date; id: number } | null): SeenEntry {
  return row ? { enteredAt: row.enteredAt, id: row.id } : null;
}

beforeAll(async () => {
  const [school] = await db
    .insert(schoolsTable)
    .values({
      name: "Race guard test school (safe to delete)",
      code: `test-${crypto.randomBytes(6).toString("hex")}`,
    })
    .returning();
  schoolId = school!.id;
});

afterAll(async () => {
  // Cascades to answers and teacher snapshots.
  await db.delete(schoolsTable).where(eq(schoolsTable.id, schoolId));
  await pool.end();
});

describe("insertAnswerFromAirtable stale-snapshot guard", () => {
  it("inserts when the question has no answers and none appeared since", async () => {
    const inserted = await insertAnswerFromAirtable(schoolId, "activity_area", "Gym", null);
    expect(inserted).toBe(true);
    const row = await latest("activity_area");
    expect(row?.value).toBe("Gym");
    expect(row?.enteredBy).toBe(AIRTABLE_ENTERED_BY);
  });

  it("inserts when the latest answer is still the one the sync saw", async () => {
    const seen = asSeen(await latest("activity_area"));
    const inserted = await insertAnswerFromAirtable(schoolId, "activity_area", "Library", seen);
    expect(inserted).toBe(true);
    expect((await latest("activity_area"))?.value).toBe("Library");
  });

  it("skips when a portal save landed after the sync's read (portal wins)", async () => {
    const seen = asSeen(await latest("activity_area"));
    // Concurrent portal save, exactly like the portal route's append.
    await db.insert(answersTable).values({
      schoolId,
      questionKey: "activity_area",
      value: "Cafeteria (from portal)",
      enteredBy: "teacher@example.org",
    });
    const inserted = await insertAnswerFromAirtable(
      schoolId,
      "activity_area",
      "Stale Airtable value",
      seen,
    );
    expect(inserted).toBe(false);
    expect((await latest("activity_area"))?.value).toBe("Cafeteria (from portal)");
  });

  it("skips when the first-ever answer appeared after a no-answers read", async () => {
    await db.insert(answersTable).values({
      schoolId,
      questionKey: "workshop_time",
      value: "9:00 AM (from portal)",
      enteredBy: "teacher@example.org",
    });
    // Sync decided based on "no answers yet" (seen = null).
    const inserted = await insertAnswerFromAirtable(schoolId, "workshop_time", "10:00 AM", null);
    expect(inserted).toBe(false);
    expect((await latest("workshop_time"))?.value).toBe("9:00 AM (from portal)");
  });

  it("skips when the seen row was amended in place (same id, newer entered_at)", async () => {
    const seen = asSeen(await latest("activity_area"));
    expect(seen).not.toBeNull();
    // The portal's amendId path rewrites the same row and bumps entered_at.
    await db
      .update(answersTable)
      .set({ value: "Cafeteria (amended)", enteredAt: new Date() })
      .where(eq(answersTable.id, seen!.id));
    const inserted = await insertAnswerFromAirtable(
      schoolId,
      "activity_area",
      "Stale Airtable value",
      seen,
    );
    expect(inserted).toBe(false);
    expect((await latest("activity_area"))?.value).toBe("Cafeteria (amended)");
  });
});

describe("insertTeacherSnapshotFromAirtable stale-snapshot guard", () => {
  const airtableRows = [
    { firstName: "Ann", lastName: "Airtable", email: "ann@example.org", studentCount: 20 },
  ];

  async function latestSnapshot() {
    const [row] = await db
      .select()
      .from(teacherSnapshotsTable)
      .where(eq(teacherSnapshotsTable.schoolId, schoolId))
      .orderBy(desc(teacherSnapshotsTable.enteredAt), desc(teacherSnapshotsTable.id))
      .limit(1);
    return row ?? null;
  }

  it("inserts when no newer snapshot exists", async () => {
    const inserted = await insertTeacherSnapshotFromAirtable(schoolId, airtableRows, 20, null);
    expect(inserted).toBe(true);
    expect((await latestSnapshot())?.enteredBy).toBe(AIRTABLE_ENTERED_BY);
  });

  it("skips when a portal teacher save landed after the sync's read", async () => {
    const seenRow = await latestSnapshot();
    const seen = asSeen(seenRow ? { enteredAt: seenRow.enteredAt, id: seenRow.id } : null);
    const portalRows = [
      { firstName: "Pat", lastName: "Portal", email: "pat@example.org", studentCount: 25 },
    ];
    await db.insert(teacherSnapshotsTable).values({
      schoolId,
      rows: portalRows,
      totalStudents: 25,
      enteredBy: "teacher@example.org",
    });
    const inserted = await insertTeacherSnapshotFromAirtable(schoolId, airtableRows, 20, seen);
    expect(inserted).toBe(false);
    const latestNow = await latestSnapshot();
    expect(latestNow?.enteredBy).toBe("teacher@example.org");
    expect(latestNow?.totalStudents).toBe(25);
  });
});
