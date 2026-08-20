/**
 * Integration tests (real database) for workshop-time normalization in the
 * sync's per-field reconcile step: Airtable's free-form time text must feed
 * the portal's time view as "HH:MM", without ever pushing the normalized
 * form back over Airtable's original text, and without loops across
 * consecutive passes. Verified here against the database instead of a live
 * Airtable record so no dev data ever lands in the real base.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db, pool, answersTable, schoolsTable } from "@workspace/db";
import crypto from "node:crypto";
import { reconcileSimpleField } from "./airtable-sync";
import { AIRTABLE_ENTERED_BY } from "./airtable-merge";

const madeSchoolIds: number[] = [];

async function makeSchool(): Promise<number> {
  const [school] = await db
    .insert(schoolsTable)
    .values({
      name: "Time normalization test school (safe to delete)",
      code: `test-${crypto.randomBytes(6).toString("hex")}`,
    })
    .returning();
  madeSchoolIds.push(school!.id);
  return school!.id;
}

async function timeAnswers(schoolId: number) {
  return db
    .select()
    .from(answersTable)
    .where(and(eq(answersTable.schoolId, schoolId), eq(answersTable.questionKey, "workshop_time")))
    .orderBy(desc(answersTable.enteredAt), desc(answersTable.id));
}

const reconcileTime = (schoolId: number, airtableValue: string, last: string | undefined) =>
  reconcileSimpleField({ schoolId, questionKey: "workshop_time", airtableValue, last });

beforeAll(async () => {
  // nothing shared; each scenario makes its own school
});

afterAll(async () => {
  for (const id of madeSchoolIds) {
    await db.delete(schoolsTable).where(eq(schoolsTable.id, id)); // cascades to answers
  }
  await pool.end();
});

describe("workshop-time pull normalization across sync passes", () => {
  it("pulls Airtable free text as a normalized clock value, then stays stable", async () => {
    const schoolId = await makeSchool();
    const RAW = "8:15am - 9:45am";

    // Pass 1: new Airtable value, empty portal, no baseline → pull normalized.
    const pass1 = await reconcileTime(schoolId, RAW, undefined);
    expect(pass1.action).toBe("pull");
    expect(pass1.rowsInserted).toBe(1);
    expect(pass1.nextLast).toBe(RAW); // baseline keeps Airtable's raw text
    let rows = await timeAnswers(schoolId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe("08:15"); // the time view understands this
    expect(rows[0]!.enteredBy).toBe(AIRTABLE_ENTERED_BY);

    // Pass 2: nothing changed anywhere → no push, no insert, no loop.
    const pass2 = await reconcileTime(schoolId, RAW, RAW);
    expect(pass2.action).toBe("none");
    expect(pass2.rowsInserted).toBe(0);
    expect(pass2.nextLast).toBe(RAW);
    expect(await timeAnswers(schoolId)).toHaveLength(1);

    // Airtable edits the time → pulled normalized again.
    const EDITED = "9am - 10:30am";
    const pass3 = await reconcileTime(schoolId, EDITED, RAW);
    expect(pass3.action).toBe("pull");
    expect(pass3.rowsInserted).toBe(1);
    expect(pass3.nextLast).toBe(EDITED);
    rows = await timeAnswers(schoolId);
    expect(rows[0]!.value).toBe("09:00");

    // And settles again on the next pass.
    const pass4 = await reconcileTime(schoolId, EDITED, EDITED);
    expect(pass4.action).toBe("none");
    expect(pass4.rowsInserted).toBe(0);

    // A REAL portal edit still wins and is pushed.
    await db.insert(answersTable).values({
      schoolId,
      questionKey: "workshop_time",
      value: "10:30",
      enteredBy: "pat@school.org",
    });
    const pass5 = await reconcileTime(schoolId, EDITED, EDITED);
    expect(pass5.action).toBe("push");
    expect(pass5.portalValue).toBe("10:30");
    expect(pass5.nextLast).toBeNull(); // baseline advances only on push success
    expect(pass5.rowsInserted).toBe(0);
  });

  it("keeps genuinely unparseable Airtable text as-is (today's behavior)", async () => {
    const schoolId = await makeSchool();
    const RAW = "right after morning assembly";

    const pass1 = await reconcileTime(schoolId, RAW, undefined);
    expect(pass1.action).toBe("pull");
    const rows = await timeAnswers(schoolId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe(RAW); // stored raw → "Currently saved" note

    const pass2 = await reconcileTime(schoolId, RAW, RAW);
    expect(pass2.action).toBe("none");
    expect(pass2.rowsInserted).toBe(0); // no backfill: it still doesn't parse
    expect(await timeAnswers(schoolId)).toHaveLength(1);
  });
});

describe("backfill of schools synced before normalization existed", () => {
  it("appends a normalized row for an Airtable-entered raw time that parses now", async () => {
    const schoolId = await makeSchool();
    const RAW = "8:15am - 9:45am";
    // The pre-normalization state: raw text answer from Airtable, baseline agrees.
    await db.insert(answersTable).values({
      schoolId,
      questionKey: "workshop_time",
      value: RAW,
      enteredBy: AIRTABLE_ENTERED_BY,
    });

    const pass1 = await reconcileTime(schoolId, RAW, RAW);
    expect(pass1.action).toBe("none"); // nothing to push — Airtable text untouched
    expect(pass1.rowsInserted).toBe(1);
    const rows = await timeAnswers(schoolId);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.value).toBe("08:15");
    expect(rows[0]!.enteredBy).toBe(AIRTABLE_ENTERED_BY);

    // Next pass: the current answer is already a clock value → no re-backfill.
    const pass2 = await reconcileTime(schoolId, RAW, RAW);
    expect(pass2.action).toBe("none");
    expect(pass2.rowsInserted).toBe(0);
    expect(await timeAnswers(schoolId)).toHaveLength(2);
  });

  it("never rewrites portal-entered answers", async () => {
    const schoolId = await makeSchool();
    // A portal user typed a parseable-but-nonstandard time long ago (edge
    // case), and the baseline matches Airtable. Not Airtable-entered → the
    // backfill must leave it alone.
    await db.insert(answersTable).values({
      schoolId,
      questionKey: "workshop_time",
      value: "8:15am",
      enteredBy: "pat@school.org",
    });

    const pass = await reconcileTime(schoolId, "8:15am", "8:15am");
    expect(pass.action).toBe("none"); // same clock value — not a portal edit
    expect(pass.rowsInserted).toBe(0);
    expect(await timeAnswers(schoolId)).toHaveLength(1);
  });
});
