import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  answersTable,
  teacherSnapshotsTable,
  infoPagesTable,
  schoolsTable,
} from "@workspace/db";
import {
  IdentifyPortalUserBody,
  FetchPortalAnswersBody,
  SaveAnswerBody,
  SaveTeachersBody,
} from "@workspace/api-zod";
import {
  QUESTION_KEYS,
  canEdit,
  findSchoolByCode,
  getSchoolAnswers,
  isAuthorizedForSchool,
  normalizeEmail,
} from "../lib/answers";
import { PAM_EMAIL } from "../lib/auth";
import {
  AIRTABLE_FIELDS,
  formatTeacherEmails,
  formatTeacherNames,
  writeAnswersToAirtable,
} from "../lib/airtable";

const router: IRouter = Router();

function portalSchool(school: {
  id: number;
  name: string;
  workshopDate: string | null;
  locked: boolean;
  approxStudents: string | null;
}) {
  return {
    id: school.id,
    name: school.name,
    workshopDate: school.workshopDate,
    locked: school.locked,
    approxStudents: school.approxStudents,
  };
}

function codeParam(req: { params: Record<string, unknown> }): string {
  const raw = req.params["code"];
  return Array.isArray(raw) ? String(raw[0]) : String(raw);
}

router.post("/portal/:code/identify", async (req, res): Promise<void> => {
  const parsed = IdentifyPortalUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please enter your email address." });
    return;
  }
  const school = await findSchoolByCode(codeParam(req));
  if (!school) {
    res.status(404).json({ error: "This link doesn't match any school. Please check the link in your email." });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const authorized = await isAuthorizedForSchool(school.id, email);
  if (!authorized) {
    req.log.warn({ schoolId: school.id }, "Portal access denied");
    res.status(403).json({
      error:
        "That email address isn't on this school's contact list. If it should be, please contact A Touch of Understanding.",
    });
    return;
  }
  res.json({
    email,
    isAdminContact: email === PAM_EMAIL,
    school: portalSchool(school),
  });
});

router.post("/portal/:code/answers/fetch", async (req, res): Promise<void> => {
  const parsed = FetchPortalAnswersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email is required." });
    return;
  }
  const school = await findSchoolByCode(codeParam(req));
  if (!school) {
    res.status(404).json({ error: "Unknown school link." });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  if (!(await isAuthorizedForSchool(school.id, email))) {
    res.status(403).json({ error: "Not authorized for this school." });
    return;
  }
  const answers = await getSchoolAnswers(school.id);
  res.json({ school: portalSchool(school), ...answers });
});

router.put("/portal/:code/answers/:questionKey", async (req, res): Promise<void> => {
  const parsed = SaveAnswerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A value is required." });
    return;
  }
  const rawKey = req.params["questionKey"];
  const questionKey = Array.isArray(rawKey) ? String(rawKey[0]) : String(rawKey);
  if (!(QUESTION_KEYS as readonly string[]).includes(questionKey)) {
    res.status(400).json({ error: "Unknown question." });
    return;
  }
  const school = await findSchoolByCode(codeParam(req));
  if (!school) {
    res.status(404).json({ error: "Unknown school link." });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  if (!(await isAuthorizedForSchool(school.id, email))) {
    res.status(403).json({ error: "Not authorized for this school." });
    return;
  }
  if (!canEdit(school, email)) {
    res.status(403).json({ error: "Answers for this school are currently locked. Please contact A Touch of Understanding." });
    return;
  }

  // When the client is amending an in-progress edit (amendId), update that
  // history entry in place instead of appending a new one — but only if it
  // is still the latest entry for this question and was written by the same
  // person. The check and the update happen in ONE conditional statement so
  // a save that lands in between can't have its newer entry rewritten; if
  // the condition no longer holds, we fall back to appending.
  let saved: typeof answersTable.$inferSelect | undefined;
  const amendId = parsed.data.amendId;
  if (amendId != null) {
    [saved] = await db
      .update(answersTable)
      .set({ value: parsed.data.value, enteredAt: new Date() })
      .where(
        and(
          eq(answersTable.id, amendId),
          eq(answersTable.schoolId, school.id),
          eq(answersTable.questionKey, questionKey),
          sql`lower(trim(${answersTable.enteredBy})) = ${email}`,
          sql`not exists (
            select 1 from ${answersTable} newer
            where newer.school_id = ${school.id}
              and newer.question_key = ${questionKey}
              and (newer.entered_at, newer.id) > (${answersTable.enteredAt}, ${answersTable.id})
          )`,
        ),
      )
      .returning();
  }
  if (!saved) {
    [saved] = await db
      .insert(answersTable)
      .values({ schoolId: school.id, questionKey, value: parsed.data.value, enteredBy: email })
      .returning();
  }

  // Write-back to Airtable (no-op while the connection is off).
  // "notes" and "timing_note" stay in our database only.
  const fieldMap: Record<string, string> = {
    workshop_time: AIRTABLE_FIELDS.workshopTime,
    activity_area: AIRTABLE_FIELDS.activityArea,
    speaker_area: AIRTABLE_FIELDS.speakerArea,
  };
  const fieldId = fieldMap[questionKey];
  if (fieldId) {
    await writeAnswersToAirtable(school.airtableRecordId, { [fieldId]: parsed.data.value });
  }

  res.json({
    id: saved!.id,
    value: saved!.value,
    enteredBy: saved!.enteredBy,
    enteredAt: saved!.enteredAt.toISOString(),
  });
});

router.put("/portal/:code/teachers", async (req, res): Promise<void> => {
  const parsed = SaveTeachersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Every teacher row needs a first name, last name, email, and student count." });
    return;
  }
  const school = await findSchoolByCode(codeParam(req));
  if (!school) {
    res.status(404).json({ error: "Unknown school link." });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  if (!(await isAuthorizedForSchool(school.id, email))) {
    res.status(403).json({ error: "Not authorized for this school." });
    return;
  }
  if (!canEdit(school, email)) {
    res.status(403).json({ error: "Answers for this school are currently locked. Please contact A Touch of Understanding." });
    return;
  }

  const rows = parsed.data.rows.map((r) => ({
    firstName: r.firstName.trim(),
    lastName: r.lastName.trim(),
    email: r.email.trim(),
    studentCount: r.studentCount,
  }));
  const totalStudents = rows.reduce((sum, r) => sum + r.studentCount, 0);

  const [saved] = await db
    .insert(teacherSnapshotsTable)
    .values({ schoolId: school.id, rows, totalStudents, enteredBy: email })
    .returning();

  await writeAnswersToAirtable(school.airtableRecordId, {
    [AIRTABLE_FIELDS.teacherNamesWithCounts]: formatTeacherNames(rows),
    [AIRTABLE_FIELDS.teacherEmails]: formatTeacherEmails(rows),
    [AIRTABLE_FIELDS.totalStudentCount]: totalStudents,
  });

  res.json({
    id: saved!.id,
    rows: saved!.rows,
    totalStudents: saved!.totalStudents,
    enteredBy: saved!.enteredBy,
    enteredAt: saved!.enteredAt.toISOString(),
  });
});

router.get("/portal/:code/pages", async (req, res): Promise<void> => {
  const school = await findSchoolByCode(codeParam(req));
  if (!school) {
    res.status(404).json({ error: "Unknown school link." });
    return;
  }
  const pages = await db
    .select()
    .from(infoPagesTable)
    .where(eq(infoPagesTable.published, true))
    .orderBy(asc(infoPagesTable.sortOrder), asc(infoPagesTable.id));
  res.json(
    pages.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      body: p.body,
      sortOrder: p.sortOrder,
      published: p.published,
      updatedAt: p.updatedAt.toISOString(),
    })),
  );
});

export default router;
