import { desc, eq } from "drizzle-orm";
import {
  db,
  answersTable,
  teacherSnapshotsTable,
  contactsTable,
  schoolsTable,
  type School,
} from "@workspace/db";
import { PAM_EMAIL } from "./auth";

export const QUESTION_KEYS = [
  "workshop_time",
  "timing_note",
  "lunch_start",
  "lunch_end",
  "activity_area",
  "speaker_area",
  "notes",
] as const;

// Questions that count toward "complete" for the grid/summary.
// timing_note is optional; notes is optional.
export const REQUIRED_KEYS = ["teachers", "workshop_time", "activity_area", "speaker_area"] as const;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findSchoolByCode(code: string): Promise<School | null> {
  const [school] = await db.select().from(schoolsTable).where(eq(schoolsTable.code, code));
  return school ?? null;
}

/** Pam's address is authorized for every school. */
export async function isAuthorizedForSchool(schoolId: number, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (normalized === PAM_EMAIL) return true;
  const contacts = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.schoolId, schoolId));
  return contacts.some((c) => normalizeEmail(c.email) === normalized);
}

/** Pam can edit even when a school is locked. */
export function canEdit(school: School, email: string): boolean {
  if (normalizeEmail(email) === PAM_EMAIL) return true;
  return !school.locked;
}

export type AnswerVersionOut = {
  id: number;
  value: string;
  enteredBy: string;
  enteredAt: string;
};

export async function getSchoolAnswers(schoolId: number) {
  const allAnswers = await db
    .select()
    .from(answersTable)
    .where(eq(answersTable.schoolId, schoolId))
    .orderBy(desc(answersTable.enteredAt), desc(answersTable.id));

  const questions = QUESTION_KEYS.map((key) => {
    const versions = allAnswers
      .filter((a) => a.questionKey === key)
      .map((a) => ({
        id: a.id,
        value: a.value,
        enteredBy: a.enteredBy,
        enteredAt: a.enteredAt.toISOString(),
      }));
    return {
      questionKey: key,
      current: versions[0] ?? null,
      history: versions.slice(1),
    };
  });

  const snapshots = await db
    .select()
    .from(teacherSnapshotsTable)
    .where(eq(teacherSnapshotsTable.schoolId, schoolId))
    .orderBy(desc(teacherSnapshotsTable.enteredAt), desc(teacherSnapshotsTable.id));

  const snaps = snapshots.map((s) => ({
    id: s.id,
    rows: s.rows,
    totalStudents: s.totalStudents,
    enteredBy: s.enteredBy,
    enteredAt: s.enteredAt.toISOString(),
  }));

  return {
    questions,
    teachers: { current: snaps[0] ?? null, history: snaps.slice(1) },
  };
}

export type QuestionStateOut = {
  questionKey: string;
  answered: boolean;
  summary: string | null;
};

/** Per-question state for the admin grid: teachers + the simple questions. */
export async function getQuestionStates(schoolId: number): Promise<QuestionStateOut[]> {
  const { questions, teachers } = await getSchoolAnswers(schoolId);
  const states: QuestionStateOut[] = [];
  states.push({
    questionKey: "teachers",
    answered: teachers.current !== null,
    summary: teachers.current
      ? `${teachers.current.rows.length} teachers, ${teachers.current.totalStudents} students`
      : null,
  });
  for (const q of questions) {
    // timing_note is optional; the lunch times feed the workshop-time
    // schedule and aren't tracked as their own grid columns.
    if (["timing_note", "lunch_start", "lunch_end"].includes(q.questionKey)) continue;
    states.push({
      questionKey: q.questionKey,
      answered: q.current !== null,
      summary: q.current ? q.current.value.slice(0, 80) : null,
    });
  }
  return states;
}

export function missingCount(states: QuestionStateOut[]): number {
  return states.filter(
    (s) => (REQUIRED_KEYS as readonly string[]).includes(s.questionKey) && !s.answered,
  ).length;
}
