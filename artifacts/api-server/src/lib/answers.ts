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
import {
  buildSchedule,
  effectiveStudentCount,
  needsThreeSessions,
} from "@workspace/schedule";

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
  // Answered, but the value conflicts with the calculated workshop
  // schedule (only ever true for workshop_time).
  conflict: boolean;
  // Answered, but part of it is still missing (only ever true for
  // teachers: a saved list where a teacher has no student count).
  incomplete: boolean;
  summary: string | null;
};

// "one" through "ten" spelled out for the missing-count note; numerals beyond
const missingCountWord = (n: number) =>
  ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n - 1] ?? String(n);

/** Per-question state for the admin grid: teachers + the simple questions. */
export async function getQuestionStates(school: School): Promise<QuestionStateOut[]> {
  const { questions, teachers } = await getSchoolAnswers(school.id);
  const states: QuestionStateOut[] = [];
  // Same completeness rule the school form and confirmation screen use:
  // a saved teacher list where any teacher has no student count is
  // partial, not complete.
  const missingTeacherCounts = teachers.current
    ? teachers.current.rows.filter((r) => !(Number(r.studentCount) > 0)).length
    : 0;
  states.push({
    questionKey: "teachers",
    answered: teachers.current !== null,
    conflict: false,
    incomplete: missingTeacherCounts > 0,
    summary: teachers.current
      ? `${teachers.current.rows.length} teachers, ${teachers.current.totalStudents} students` +
        (missingTeacherCounts > 0
          ? `, ${missingCountWord(missingTeacherCounts)} teacher count${missingTeacherCounts === 1 ? "" : "s"} missing`
          : "")
      : null,
  });

  // Same schedule/conflict verdict the school form shows (shared library):
  // for three-session schools, a lunch time that clashes with the
  // calculated sessions makes the workshop time "answered but conflicting".
  const currentValue = (key: string) =>
    questions.find((q) => q.questionKey === key)?.current?.value ?? "";
  const totalStudents = teachers.current?.totalStudents ?? 0;
  const effectiveStudents = effectiveStudentCount(totalStudents, school.approxStudents);
  const schedule = buildSchedule({
    workshopTime: currentValue("workshop_time"),
    lunchStart: currentValue("lunch_start"),
    lunchEnd: currentValue("lunch_end"),
    threeSessions: needsThreeSessions(effectiveStudents),
  });
  const timeConflict = schedule !== null && schedule.conflicts.length > 0;

  for (const q of questions) {
    // timing_note is optional; the lunch times feed the workshop-time
    // schedule and aren't tracked as their own grid columns.
    if (["timing_note", "lunch_start", "lunch_end"].includes(q.questionKey)) continue;
    states.push({
      questionKey: q.questionKey,
      answered: q.current !== null,
      conflict: q.questionKey === "workshop_time" && q.current !== null && timeConflict,
      incomplete: false,
      summary: q.current ? q.current.value.slice(0, 80) : null,
    });
  }
  return states;
}

/**
 * Required answers still outstanding. An answered-but-conflicting workshop
 * time counts as outstanding: the school isn't complete until it works.
 * Likewise an answered-but-incomplete teacher list (a teacher missing a
 * student count): the school isn't complete until every count is in.
 */
export function missingCount(states: QuestionStateOut[]): number {
  return states.filter(
    (s) =>
      (REQUIRED_KEYS as readonly string[]).includes(s.questionKey) &&
      (!s.answered || s.conflict || s.incomplete),
  ).length;
}
