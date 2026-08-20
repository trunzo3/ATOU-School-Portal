/**
 * Best-effort parsing of the free-form Airtable Workshops columns
 * "Teacher Name / Student Count" and "Teacher Email Address" into the
 * app's structured teacher rows. Used by the Airtable pull sync when the
 * teacher fields were edited directly in Airtable.
 *
 * Same rules as the original one-time import (scripts/src/parse-workshop-answers.ts):
 * one teacher per non-empty line; parentheticals, the word "student(s)" and
 * grade ordinals ("4th") are noise; the last remaining number is the student
 * count; if a "/" splits two people, the person after it (the current
 * teacher/substitute) wins; the last word becomes the last name. Emails are
 * extracted in order and paired by position.
 */
export type ParsedTeacherRow = {
  firstName: string;
  lastName: string;
  email: string;
  studentCount: number;
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function parseTeacherLine(line: string): { firstName: string; lastName: string; studentCount: number } {
  let s = line
    .replace(/\([^)]*\)/g, " ") // parenthetical notes/rooms/counts-in-parens handled below
    .replace(/students?/gi, " ")
    .replace(/\b\d+(?:st|nd|rd|th)\b/gi, " ") // grade ordinals like "4th"
    .replace(/\s+/g, " ")
    .trim();

  // Count = last standalone number; if none survived (e.g. it was "(29)"),
  // fall back to the last number in the raw line.
  let studentCount = 0;
  const nums = s.match(/\d+/g);
  if (nums && nums.length > 0) {
    const last = nums[nums.length - 1]!;
    studentCount = parseInt(last, 10);
    s = s.slice(0, s.lastIndexOf(last)) + s.slice(s.lastIndexOf(last) + last.length);
  } else {
    const rawNums = line.match(/\d+/g);
    if (rawNums && rawNums.length > 0) studentCount = parseInt(rawNums[rawNums.length - 1]!, 10);
  }

  s = s.replace(/[-–—:,#=]+/g, (m, off: number) =>
    // keep hyphens inside a word (Mulford-Roy); drop separators next to spaces/ends
    off > 0 && off + m.length < s.length && /\S/.test(s[off - 1]!) && /\S/.test(s[off + m.length]!) && m === "-"
      ? m
      : " ",
  );
  s = s.replace(/\s+/g, " ").trim();

  // "Person A / Person B" — B is the current teacher (substitute pattern).
  if (s.includes("/")) s = s.split("/").pop()!.trim();

  const words = s.split(" ").filter((w) => w.length > 0);
  const lastName = words.pop() ?? "";
  const firstName = words.join(" ");
  return { firstName, lastName, studentCount };
}

export function parseTeachers(
  namesText: string | null,
  emailsText: string | null,
): { rows: ParsedTeacherRow[]; total: number } {
  const lines = (namesText ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const emails = (emailsText ?? "").match(EMAIL_RE) ?? [];

  const rows: ParsedTeacherRow[] = lines.map((line, i) => ({
    ...parseTeacherLine(line),
    email: emails[i] ?? "",
  }));

  return { rows, total: rows.reduce((sum, r) => sum + r.studentCount, 0) };
}
