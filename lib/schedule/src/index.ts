// Workshop session schedule logic shared by the school form, the
// confirmation (Done) page, and the API server's completeness checks.
//
// The rules are exactly what the school form has always shown:
// - 104 students or fewer: two 1.5-hour sessions with a 15-minute break.
// - 105 or more: two 1.5-hour morning sessions (15-minute break between
//   them), then the school's lunch, then a third 1.5-hour session.
// - A "conflict" is exactly what the form warns about: for three-session
//   schools, lunch starting before the morning sessions end, or lunch end
//   not after lunch start. Missing lunch times are NOT a conflict — they
//   only produce a pending hint.

/** Student count at which a school needs three sessions (and lunch times). */
export const THREE_SESSION_MIN_STUDENTS = 105;

export type ScheduleLine = { label: string; time: string };

/** Machine-readable conflict reasons, parallel to `warnings`. */
export type ScheduleConflict = "lunch_before_sessions_end" | "lunch_end_not_after_start";

export type ScheduleResult = {
  lines: ScheduleLine[];
  /** Exact warning wording shown on the form. Empty when there is no conflict. */
  warnings: string[];
  /** Structured codes matching `warnings`, for plain-language rephrasing. */
  conflicts: ScheduleConflict[];
  /** Hint shown while lunch times are still missing (three-session schools). */
  pending: string | null;
};

/** Parse "HH:MM" (24-hour) into minutes since midnight, or null. */
export function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** Format minutes since midnight as "h:mm AM/PM". */
export function fmtMin(mins: number): string {
  const d = new Date();
  d.setHours(Math.floor(mins / 60) % 24, mins % 60, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Compact morning-schedule summary used in the workshop-time history. */
export function computeBreakTimes(startTimeStr: string): string | null {
  const start = parseHM(startTimeStr);
  if (start === null) return null;
  const s1End = start + 90;
  const s2Start = s1End + 15;
  const s2End = s2Start + 90;
  return `${fmtMin(start)} – ${fmtMin(s1End)}, break, ${fmtMin(s2Start)} – ${fmtMin(s2End)}`;
}

/**
 * Student count that drives the two- vs three-session schedule: the live
 * teacher list total when there is one, otherwise ATOU's approximate count.
 */
export function effectiveStudentCount(
  teacherTotalStudents: number,
  approxStudents: string | null | undefined,
): number {
  if (teacherTotalStudents > 0) return teacherTotalStudents;
  const approx = parseInt(approxStudents || "", 10);
  return Number.isNaN(approx) ? 0 : approx;
}

export function needsThreeSessions(effectiveStudents: number): boolean {
  return effectiveStudents >= THREE_SESSION_MIN_STUDENTS;
}

export type ScheduleInput = {
  /** Workshop start time, "HH:MM". Anything else yields no schedule. */
  workshopTime: string;
  /** School lunch start, "HH:MM" (three-session schools only). */
  lunchStart: string;
  /** School lunch end, "HH:MM" (three-session schools only). */
  lunchEnd: string;
  threeSessions: boolean;
};

/**
 * The live schedule shown under the time fields, with any conflict
 * warnings. Returns null when the workshop time isn't a parseable clock
 * time (e.g. blank, or free text imported from Airtable).
 */
export function buildSchedule({ workshopTime, lunchStart, lunchEnd, threeSessions }: ScheduleInput): ScheduleResult | null {
  const start = parseHM(workshopTime);
  if (start === null) return null;
  const s1End = start + 90;
  const s2Start = s1End + 15;
  const s2End = s2Start + 90;
  const lines: ScheduleLine[] = [
    { label: "Session 1", time: `${fmtMin(start)} – ${fmtMin(s1End)}` },
    { label: "Break", time: `${fmtMin(s1End)} – ${fmtMin(s2Start)}` },
    { label: "Session 2", time: `${fmtMin(s2Start)} – ${fmtMin(s2End)}` },
  ];
  const warnings: string[] = [];
  const conflicts: ScheduleConflict[] = [];
  let pending: string | null = null;
  if (threeSessions) {
    const ls = parseHM(lunchStart);
    const le = parseHM(lunchEnd);
    if (ls === null || le === null) {
      pending = "Enter your school's lunch time to see the afternoon session.";
    } else {
      if (ls < s2End) {
        warnings.push(`Lunch starts before the morning sessions end (${fmtMin(s2End)}). Please adjust the start time or check the lunch time.`);
        conflicts.push("lunch_before_sessions_end");
      }
      if (le <= ls) {
        warnings.push("Lunch end needs to be after lunch start.");
        conflicts.push("lunch_end_not_after_start");
      }
      lines.push({ label: "Lunch", time: `${fmtMin(ls)} – ${fmtMin(le)}` });
      if (le > ls) lines.push({ label: "Session 3", time: `${fmtMin(le)} – ${fmtMin(le + 90)}` });
    }
  }
  return { lines, warnings, conflicts, pending };
}

/**
 * Whether the given workshop/lunch times conflict with the calculated
 * schedule. Missing or unparseable times are never a conflict.
 */
export function hasScheduleConflict(input: ScheduleInput): boolean {
  const schedule = buildSchedule(input);
  return schedule !== null && schedule.conflicts.length > 0;
}

/** Plain-language phrasing of each conflict, for summaries outside the form. */
export function describeConflict(conflict: ScheduleConflict): string {
  switch (conflict) {
    case "lunch_before_sessions_end":
      return "lunch overlaps the morning sessions";
    case "lunch_end_not_after_start":
      return "lunch end time is not after lunch start";
  }
}
