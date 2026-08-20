// The date the logistics email is due to go out to a school that has never
// been emailed: the configured number of days before its workshop (60 by
// default). Skipped schools show nothing.
//
// When automatic sending is ON, this is the real schedule: only dates that
// are still coming up (today or later) are shown — a past due date won't
// fire, so showing it would be misleading.
//
// When automatic sending is OFF, the date is a reminder for Pam: it stays
// visible even a little overdue, until the workshop is less than 30 days
// away; past that point the "two months out" email no longer makes sense.
export type PendingSendOptions = {
  /** Pam skipped this school's automatic send. */
  skipped?: boolean;
  /** Days before the workshop the email goes out (default 60). */
  daysBefore?: number;
  /** Whether automatic logistics emails are turned on. */
  autoEnabled?: boolean;
  // Injectable for tests; defaults to today's date in Pacific time,
  // in the same YYYY-MM-DD shape for a plain string compare.
  today?: string;
};

export function pendingSendDate(
  workshopDate: string | null,
  sendStatus: string,
  options: PendingSendOptions = {},
): string | null {
  const {
    skipped = false,
    daysBefore = 60,
    autoEnabled = false,
    today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date()),
  } = options;
  if (sendStatus !== "never_sent" || !workshopDate || skipped) return null;
  const workshop = new Date(`${workshopDate}T00:00:00Z`);
  if (Number.isNaN(workshop.getTime())) return null;
  const due = new Date(workshop);
  due.setUTCDate(due.getUTCDate() - daysBefore);
  const dueStr = due.toISOString().slice(0, 10);
  if (autoEnabled) {
    // Real schedule: only future (or today's) sends exist.
    return dueStr >= today ? dueStr : null;
  }
  const cutoff = new Date(workshop);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return cutoffStr >= today ? dueStr : null;
}
