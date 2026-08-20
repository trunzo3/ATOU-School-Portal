// Date-only helpers. Workshop dates are bare YYYY-MM-DD strings; all "what
// day is it" questions are answered in Pacific time, where Pam works.

/** Today's date in Pacific time as YYYY-MM-DD (en-CA gives that shape). */
export function pacificToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

/** Day of week in Pacific time: 0 = Sunday … 6 = Saturday. */
export function pacificWeekday(now: Date = new Date()): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
  }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Add (or subtract) whole days to a YYYY-MM-DD string. Null if unparseable. */
export function addDays(dateStr: string, days: number): string | null {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from one YYYY-MM-DD to another (positive when `to` is later). */
export function diffDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "2026-08-10" → "Aug 10" (calendar date, no timezone shift). */
export function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(d);
}

/** "2026-08-10" → "August 10, 2026". */
export function longDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/** "16:00" → "4:00 PM"; anything that isn't a plain clock time passes through. */
export function clockTo12h(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const h = Number(m[1]);
  if (h > 23) return value;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m[2]} ${suffix}`;
}
