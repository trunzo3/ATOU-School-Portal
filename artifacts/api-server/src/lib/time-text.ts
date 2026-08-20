/**
 * Normalizes the free-form workshop-time text that arrives from Airtable
 * (e.g. "8:15am - 9:45am", "8:15 AM", "8am") into the portal's strict
 * "HH:MM" 24-hour clock form — the only shape the Start Time picker, the
 * calculated schedule, and the printable form understand (see parseHM in
 * the shared schedule library).
 *
 * Returns null when the text is not confidently a clock time; callers keep
 * the raw text in that case and the portal shows it as the "Currently
 * saved" note with a blank picker, exactly as before.
 *
 * Rules:
 * - A range keeps only its start time — the schedule computes end times.
 * - 12-hour times need an am/pm marker ("8am", "8:15 pm", "1:30 p.m.").
 * - Times with minutes but no am/pm are read as 24-hour ("8:15", "13:45"),
 *   unless a later range part carries an am/pm to inherit (see below).
 * - A bare hour with no am/pm anywhere ("8") is ambiguous → null.
 * - When the start of a range has no am/pm but a later part does, the start
 *   inherits it, flipping across noon when the range "wraps" on a 12-hour
 *   dial: "8 - 9:30am" → 08:00, "1:30 - 2:30pm" → 13:30, but
 *   "11 - 1:30pm" → 11:00 (crosses noon, so the start is AM).
 */

/** One time term: hour, optional :MM or .MM, optional am/pm marker. */
const TIME_PART = /^(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i;

/** Separators that make the text a range: "-", "–", "—", "~", "to", "until", "till". */
const RANGE_SEP = /(?:\s+(?:to|until|till|thru)\s+|\s*[-\u2013\u2014~]\s*)/i;

type Meridiem = "am" | "pm";

const pad = (n: number): string => String(n).padStart(2, "0");

function meridiemOf(raw: string | undefined): Meridiem | null {
  if (!raw) return null;
  return raw.toLowerCase().startsWith("a") ? "am" : "pm";
}

/**
 * The am/pm the start of a range inherits from a later part, or null when
 * no later part has one. A range whose start "wraps past" its end on a
 * 12-hour dial crosses noon, so the start sits in the other half of the day.
 */
function inheritMeridiem(startHour: number, laterParts: string[]): Meridiem | null {
  if (startHour < 1 || startHour > 12) return null;
  for (const part of laterParts) {
    const m = TIME_PART.exec(part);
    const meridiem = meridiemOf(m?.[3]);
    if (!m || meridiem === null) continue;
    const endHour = Number(m[1]);
    if (endHour < 1 || endHour > 12) return null;
    // % 12 puts 12 o'clock at position 0, so "12 - 1pm" reads as noon.
    const crossesNoon = startHour % 12 > endHour % 12;
    return crossesNoon ? (meridiem === "am" ? "pm" : "am") : meridiem;
  }
  return null;
}

/**
 * Convert common Airtable time text to "HH:MM" (24-hour), or null when the
 * text is not confidently parseable as a clock time.
 */
export function normalizeTimeText(text: string): string | null {
  const trimmed = (text ?? "").trim();
  if (trimmed === "") return null;
  const parts = trimmed
    .split(RANGE_SEP)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const first = parts[0];
  if (!first) return null;
  const m = TIME_PART.exec(first);
  if (!m) return null;
  const hour = Number(m[1]);
  const hasMinutes = m[2] !== undefined;
  const minute = hasMinutes ? Number(m[2]) : 0;
  if (minute > 59) return null;

  let meridiem = meridiemOf(m[3]);
  if (meridiem === null) {
    meridiem = inheritMeridiem(hour, parts.slice(1));
  }
  if (meridiem !== null) {
    if (hour < 1 || hour > 12) return null;
    const h24 = meridiem === "am" ? hour % 12 : (hour % 12) + 12;
    return `${pad(h24)}:${pad(minute)}`;
  }

  // No am/pm anywhere: minutes make it a 24-hour clock value; a bare hour
  // is ambiguous and stays unparsed.
  if (!hasMinutes) return null;
  if (hour > 23) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/**
 * True when two workshop-time texts denote the same clock time — either
 * literally identical (after trimming) or both normalizing to the same
 * "HH:MM". Used by the sync merge so the portal's normalized form of
 * Airtable's own text ("08:15" from "8:15am - 9:45am") is never mistaken
 * for a portal edit and pushed back over Airtable's original text.
 */
export function sameTimeText(a: string, b: string): boolean {
  if (a.trim() === b.trim()) return true;
  const na = normalizeTimeText(a);
  return na !== null && na === normalizeTimeText(b);
}
