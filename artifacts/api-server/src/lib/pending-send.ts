// The date the logistics email is meant to reach a school: two months
// (60 days) before its workshop. Shown on the admin dashboard for schools
// that have never been emailed — even a little overdue — until the workshop
// is less than 30 days away; past that point the "two months out" email no
// longer makes sense, so nothing is shown.
export function pendingSendDate(
  workshopDate: string | null,
  sendStatus: string,
  // Injectable for tests; defaults to today's date in Pacific time,
  // in the same YYYY-MM-DD shape for a plain string compare.
  today: string = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date()),
): string | null {
  if (sendStatus !== "never_sent" || !workshopDate) return null;
  const workshop = new Date(`${workshopDate}T00:00:00Z`);
  if (Number.isNaN(workshop.getTime())) return null;
  const due = new Date(workshop);
  due.setUTCDate(due.getUTCDate() - 60);
  const cutoff = new Date(workshop);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const dueStr = due.toISOString().slice(0, 10);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return cutoffStr >= today ? dueStr : null;
}
