import { asc } from "drizzle-orm";
import {
  db,
  answersTable,
  emailSendsTable,
  schoolsTable,
  teacherSnapshotsTable,
  type School,
} from "@workspace/db";
import {
  buildSchedule,
  describeConflict,
  effectiveStudentCount,
  needsThreeSessions,
  parseScheduleOverride,
} from "@workspace/schedule";
import {
  getQuestionStates,
  getSchoolAnswers,
  missingCount,
  type QuestionStateOut,
} from "./answers";
import { isSchoolEntry, schoolSendStatus } from "./send-status";
import { getLogisticsAutoSettings } from "./settings";
import { REQUEST_TEMPLATE_ID } from "./templates";
import { addDays, clockTo12h, diffDays, longDate, pacificToday, shortDate } from "./dates";
import { appBaseUrl } from "./appUrl";

export type SummaryReport = {
  asOf: string;
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  counts: { workshops: number; complete: number; partial: number; untouched: number };
  needsAttention: {
    sentWaiting: Array<{ schoolId: number; name: string; lastSentAt: string; daysWaiting: number }>;
    notSent: Array<{ schoolId: number; name: string; workshopDate: string; daysUntil: number }>;
    missingCounts: Array<{ schoolId: number; name: string; missing: number; total: number }>;
    conflicts: Array<{ schoolId: number; name: string; description: string }>;
    lockedWithGaps: Array<{ schoolId: number; name: string; gaps: string }>;
  };
  comingUp: Array<{
    schoolId: number;
    name: string;
    workshopDate: string;
    stillOpen: string;
    complete: boolean;
  }>;
  scheduledSends: {
    enabled: boolean;
    items: Array<{ schoolId: number; name: string; sendDate: string; workshopDate: string }>;
  };
  sinceLastWeek: {
    from: string;
    to: string;
    newAnswers: Array<{ schoolId: number; name: string; status: string; date: string }>;
    changes: Array<{
      schoolId: number;
      name: string;
      label: string;
      oldValue: string;
      newValue: string;
      at: string;
    }>;
    emailsSent: Array<{ label: string; schools: number; source: string }>;
  };
};

const QUESTION_LABELS: Record<string, string> = {
  teachers: "teacher list",
  workshop_time: "workshop time",
  timing_note: "timing note",
  lunch_start: "lunch start",
  lunch_end: "lunch end",
  schedule_override: "provisional schedule",
  activity_area: "activity area",
  speaker_area: "speaker area",
  notes: "notes",
};

const TIME_KEYS = new Set(["workshop_time", "lunch_start", "lunch_end"]);

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** The outstanding pieces, in the same order the form asks for them. */
function openParts(states: QuestionStateOut[], missingTeacherCounts: number): string[] {
  const st = (k: string) => states.find((s) => s.questionKey === k);
  const parts: string[] = [];
  const teachers = st("teachers");
  if (teachers && !teachers.answered) parts.push("teacher list");
  else if (teachers?.incomplete) {
    parts.push(`${missingTeacherCounts} student count${missingTeacherCounts === 1 ? "" : "s"}`);
  }
  const time = st("workshop_time");
  if (time && !time.answered) parts.push("workshop time");
  else if (time?.conflict) parts.push("schedule conflict");
  if (st("activity_area") && !st("activity_area")!.answered) parts.push("activity area");
  if (st("speaker_area") && !st("speaker_area")!.answered) parts.push("speaker area");
  return parts;
}

function fmtValue(key: string, value: string): string {
  const trimmed = value.trim();
  // The stored schedule override is multi-line readable text; a blank value
  // means the adjustment was reset back to the calculated schedule.
  if (key === "schedule_override" && !trimmed) return "reset to calculated";
  const oneLine = key === "schedule_override" ? trimmed.replace(/\s*\n\s*/g, "; ") : trimmed;
  const shown = TIME_KEYS.has(key) ? clockTo12h(oneLine) : oneLine;
  return shown.length > 60 ? `${shown.slice(0, 57)}…` : shown;
}

export async function buildSummaryReport(daysAhead: number): Promise<SummaryReport> {
  const now = new Date();
  const today = pacificToday(now);
  const windowEnd = addDays(today, daysAhead) ?? today;
  const logistics = await getLogisticsAutoSettings();
  // The scheduled-sends section is about a school's FIRST email, so it
  // follows the first-contact (request) rule; the follow-up rule never
  // applies to never-emailed schools.
  const requestRule = logistics.rules.find((r) => r.templateId === REQUEST_TEMPLATE_ID);
  const schools = await db.select().from(schoolsTable).orderBy(asc(schoolsTable.workshopDate));

  type Info = {
    school: School;
    states: QuestionStateOut[];
    missing: number;
    answeredAny: boolean;
    sendStatus: "never_sent" | "sent_waiting" | "answered";
    lastSentAt: string | null;
    teacherTotal: number;
    teacherMissing: number;
    conflictDescription: string | null;
    inWindow: boolean;
    isPast: boolean;
  };

  const infos: Info[] = [];
  for (const school of schools) {
    const states = await getQuestionStates(school);
    const detail = await getSchoolAnswers(school.id);
    const { sendStatus, lastSentAt } = await schoolSendStatus(school.id);
    const teacherRows = detail.teachers.current?.rows ?? [];
    const teacherMissing = teacherRows.filter((r) => !(Number(r.studentCount) > 0)).length;
    const cur = (k: string) =>
      detail.questions.find((q) => q.questionKey === k)?.current?.value ?? "";
    const schedule = buildSchedule({
      workshopTime: cur("workshop_time"),
      lunchStart: cur("lunch_start"),
      lunchEnd: cur("lunch_end"),
      threeSessions: needsThreeSessions(
        effectiveStudentCount(detail.teachers.current?.totalStudents ?? 0, school.approxStudents),
      ),
    });
    // A hand-adjusted provisional schedule supersedes the calculated one,
    // so its conflicts stop being reported (matches getQuestionStates).
    const hasManualSchedule = parseScheduleOverride(cur("schedule_override")) !== null;
    const conflictDescription =
      schedule && schedule.conflicts.length > 0 && !hasManualSchedule
        ? capitalize(schedule.conflicts.map(describeConflict).join("; "))
        : null;
    const wd = school.workshopDate;
    infos.push({
      school,
      states,
      missing: missingCount(states),
      answeredAny: states.some((s) => s.answered),
      sendStatus,
      lastSentAt,
      teacherTotal: teacherRows.length,
      teacherMissing,
      conflictDescription,
      inWindow: Boolean(wd && wd >= today && wd <= windowEnd),
      isPast: Boolean(wd && wd < today),
    });
  }

  const inWindow = infos.filter((i) => i.inWindow);
  const counts = {
    workshops: inWindow.length,
    complete: inWindow.filter((i) => i.missing === 0).length,
    partial: inWindow.filter((i) => i.missing > 0 && i.answeredAny).length,
    untouched: inWindow.filter((i) => !i.answeredAny).length,
  };

  // Needs attention looks at every school whose workshop hasn't happened
  // yet (or has no date), not just the window.
  const upcoming = infos.filter((i) => !i.isPast);

  const sentWaiting = upcoming
    .filter((i) => i.sendStatus === "sent_waiting" && i.lastSentAt)
    .map((i) => {
      const sentDay = pacificToday(new Date(i.lastSentAt!));
      return {
        schoolId: i.school.id,
        name: i.school.name,
        lastSentAt: i.lastSentAt!,
        daysWaiting: Math.max(0, diffDays(sentDay, today)),
      };
    })
    .sort((a, b) => b.daysWaiting - a.daysWaiting);

  const notSent = upcoming
    .filter(
      (i) =>
        i.sendStatus === "never_sent" &&
        i.school.workshopDate &&
        diffDays(today, i.school.workshopDate) <= 60,
    )
    .map((i) => ({
      schoolId: i.school.id,
      name: i.school.name,
      workshopDate: i.school.workshopDate!,
      daysUntil: diffDays(today, i.school.workshopDate!),
    }))
    .sort((a, b) => a.workshopDate.localeCompare(b.workshopDate));

  const missingCounts = upcoming
    .filter((i) => i.teacherMissing > 0)
    .map((i) => ({
      schoolId: i.school.id,
      name: i.school.name,
      missing: i.teacherMissing,
      total: i.teacherTotal,
    }));

  const conflicts = upcoming
    .filter((i) => i.conflictDescription && i.states.some((s) => s.conflict))
    .map((i) => ({
      schoolId: i.school.id,
      name: i.school.name,
      description: i.conflictDescription!,
    }));

  const lockedWithGaps = upcoming
    .filter((i) => i.school.locked && i.missing > 0)
    .map((i) => {
      const parts = openParts(i.states, i.teacherMissing);
      const gaps =
        parts.length === 1 && !parts[0]!.includes("count") && parts[0] !== "schedule conflict"
          ? `${capitalize(parts[0]!)} not provided`
          : `Still open: ${parts.join(", ")}`;
      return { schoolId: i.school.id, name: i.school.name, gaps };
    });

  const comingUp = inWindow.map((i) => {
    let stillOpen: string;
    if (i.missing === 0) stillOpen = "Nothing — complete";
    else if (!i.answeredAny) {
      stillOpen =
        i.sendStatus === "never_sent" ? "Everything — not yet sent" : "Everything — no answers yet";
    } else {
      stillOpen = capitalize(openParts(i.states, i.teacherMissing).join(", "));
    }
    return {
      schoolId: i.school.id,
      name: i.school.name,
      workshopDate: i.school.workshopDate!,
      stillOpen,
      complete: i.missing === 0,
    };
  });

  const scheduledItems = infos
    .filter(
      (i) =>
        i.sendStatus === "never_sent" &&
        !i.school.autoSendSkipped &&
        !i.school.locked &&
        i.school.workshopDate,
    )
    .map((i) => ({
      schoolId: i.school.id,
      name: i.school.name,
      sendDate: requestRule
        ? addDays(i.school.workshopDate!, -requestRule.daysBefore)
        : null,
      workshopDate: i.school.workshopDate!,
    }))
    .filter((i): i is typeof i & { sendDate: string } => Boolean(i.sendDate && i.sendDate >= today))
    .sort((a, b) => a.sendDate!.localeCompare(b.sendDate!))
    .map((i) => ({ ...i, sendDate: i.sendDate! }));

  // --- since last week: rolling seven days back from now ---
  const from = new Date(now.getTime() - 7 * 86_400_000);
  const nameOf = new Map(schools.map((s) => [s.id, s.name]));

  const allAnswers = await db
    .select()
    .from(answersTable)
    .orderBy(asc(answersTable.enteredAt), asc(answersTable.id));
  const allSnaps = await db
    .select()
    .from(teacherSnapshotsTable)
    .orderBy(asc(teacherSnapshotsTable.enteredAt), asc(teacherSnapshotsTable.id));
  const allSends = await db.select().from(emailSendsTable);

  // Schools that answered: first-ever school-contact activity in the window.
  const newAnswers: SummaryReport["sinceLastWeek"]["newAnswers"] = [];
  for (const i of infos) {
    const activity = [
      ...allAnswers.filter((a) => a.schoolId === i.school.id && isSchoolEntry(a.enteredBy)),
      ...allSnaps.filter((s) => s.schoolId === i.school.id && isSchoolEntry(s.enteredBy)),
    ].sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
    if (activity.length === 0) continue;
    if (activity[0]!.enteredAt < from) continue;
    const latest = activity[activity.length - 1]!;
    newAnswers.push({
      schoolId: i.school.id,
      name: i.school.name,
      status: i.missing === 0 ? "complete" : "partial",
      date: latest.enteredAt.toISOString(),
    });
  }
  newAnswers.sort((a, b) => b.date.localeCompare(a.date));

  // Answers that changed: each save in the window whose value differs from
  // the previous save of the same question.
  const changes: SummaryReport["sinceLastWeek"]["changes"] = [];
  for (const a of allAnswers) {
    if (a.enteredAt < from) continue;
    const prev = [...allAnswers]
      .reverse()
      .find(
        (p) =>
          p.schoolId === a.schoolId &&
          p.questionKey === a.questionKey &&
          (p.enteredAt < a.enteredAt || (p.enteredAt.getTime() === a.enteredAt.getTime() && p.id < a.id)),
      );
    if (!prev || prev.value === a.value) continue;
    changes.push({
      schoolId: a.schoolId,
      name: nameOf.get(a.schoolId) ?? `School ${a.schoolId}`,
      label: QUESTION_LABELS[a.questionKey] ?? a.questionKey,
      oldValue: fmtValue(a.questionKey, prev.value),
      newValue: fmtValue(a.questionKey, a.value),
      at: a.enteredAt.toISOString(),
    });
  }
  for (const s of allSnaps) {
    if (s.enteredAt < from) continue;
    const prev = [...allSnaps]
      .reverse()
      .find(
        (p) =>
          p.schoolId === s.schoolId &&
          (p.enteredAt < s.enteredAt || (p.enteredAt.getTime() === s.enteredAt.getTime() && p.id < s.id)),
      );
    if (!prev || prev.totalStudents === s.totalStudents) continue;
    changes.push({
      schoolId: s.schoolId,
      name: nameOf.get(s.schoolId) ?? `School ${s.schoolId}`,
      label: "student count",
      oldValue: String(prev.totalStudents),
      newValue: String(s.totalStudents),
      at: s.enteredAt.toISOString(),
    });
  }
  changes.sort((a, b) => a.at.localeCompare(b.at));

  // Emails sent in the window, grouped by template and manual/automatic.
  const sendGroups = new Map<string, { label: string; source: string; schools: Set<number> }>();
  for (const s of allSends) {
    if (s.sentAt < from) continue;
    const label = s.templateName ?? (s.isFollowUp ? "Follow-up" : "First send");
    const key = `${label}|${s.source}`;
    const group = sendGroups.get(key) ?? { label, source: s.source, schools: new Set<number>() };
    group.schools.add(s.schoolId);
    sendGroups.set(key, group);
  }
  const emailsSent = [...sendGroups.values()].map((g) => ({
    label: g.label,
    schools: g.schools.size,
    source: g.source,
  }));

  return {
    asOf: now.toISOString(),
    windowDays: daysAhead,
    windowStart: today,
    windowEnd,
    counts,
    needsAttention: { sentWaiting, notSent, missingCounts, conflicts, lockedWithGaps },
    comingUp,
    scheduledSends: { enabled: logistics.enabled && requestRule !== undefined, items: scheduledItems },
    sinceLastWeek: {
      from: from.toISOString(),
      to: now.toISOString(),
      newAnswers,
      changes,
      emailsSent,
    },
  };
}

/** The weekly summary email: headline counts + needs attention + a link. */
export function renderWeeklyEmail(report: SummaryReport): { subject: string; text: string } {
  const subject = `Weekly Summary — ${longDate(report.windowStart)}`;
  const lines: string[] = [];
  lines.push("A TOUCH OF UNDERSTANDING — WEEKLY SUMMARY");
  lines.push(`As of ${longDate(report.windowStart)}, covering the next ${report.windowDays} days.`);
  lines.push("");
  lines.push(`Workshops in the next ${report.windowDays} days: ${report.counts.workshops}`);
  lines.push(
    `Complete: ${report.counts.complete} · Partial: ${report.counts.partial} · Untouched: ${report.counts.untouched}`,
  );
  lines.push("");
  lines.push("NEEDS ATTENTION");
  const na = report.needsAttention;
  const total =
    na.sentWaiting.length +
    na.notSent.length +
    na.missingCounts.length +
    na.conflicts.length +
    na.lockedWithGaps.length;
  if (total === 0) {
    lines.push("Nothing needs attention right now.");
  } else {
    if (na.sentWaiting.length > 0) {
      lines.push("Sent and waiting:");
      for (const r of na.sentWaiting) {
        lines.push(
          `- ${r.name} — sent ${shortDate(pacificToday(new Date(r.lastSentAt)))} · ${r.daysWaiting} days`,
        );
      }
    }
    if (na.notSent.length > 0) {
      lines.push("Not sent, inside 60 days:");
      for (const r of na.notSent) {
        lines.push(`- ${r.name} — workshop ${shortDate(r.workshopDate)} · ${r.daysUntil} days`);
      }
    }
    if (na.missingCounts.length > 0) {
      lines.push("Missing student counts:");
      for (const r of na.missingCounts) {
        lines.push(`- ${r.name} — ${r.missing} of ${r.total} teachers`);
      }
    }
    if (na.conflicts.length > 0) {
      lines.push("Schedule conflicts:");
      for (const r of na.conflicts) lines.push(`- ${r.name} — ${r.description}`);
    }
    if (na.lockedWithGaps.length > 0) {
      lines.push("Locked with gaps:");
      for (const r of na.lockedWithGaps) lines.push(`- ${r.name} — ${r.gaps}`);
    }
  }
  lines.push("");
  const base = appBaseUrl();
  if (base) lines.push(`Full summary: ${base}/admin/summary`);
  return { subject, text: lines.join("\n") };
}
