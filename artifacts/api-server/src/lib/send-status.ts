import { desc, eq } from "drizzle-orm";
import { db, answersTable, emailSendsTable, teacherSnapshotsTable } from "@workspace/db";
import { PAM_EMAIL } from "./auth";
import { normalizeEmail } from "./answers";

/** Entries by school contacts, as opposed to Pam or the Airtable import. */
export function isSchoolEntry(enteredBy: string): boolean {
  return normalizeEmail(enteredBy) !== PAM_EMAIL && enteredBy !== "Airtable import";
}

// Send status per school: never_sent, sent_waiting (sent, no school activity
// since), or answered (a school contact saved something after the last send).
export async function schoolSendStatus(schoolId: number): Promise<{
  sendStatus: "never_sent" | "sent_waiting" | "answered";
  lastSentAt: string | null;
}> {
  const [lastSend] = await db
    .select()
    .from(emailSendsTable)
    .where(eq(emailSendsTable.schoolId, schoolId))
    .orderBy(desc(emailSendsTable.sentAt))
    .limit(1);
  if (!lastSend) return { sendStatus: "never_sent", lastSentAt: null };
  const sentAt = lastSend.sentAt;
  const answers = await db
    .select({ enteredBy: answersTable.enteredBy, enteredAt: answersTable.enteredAt })
    .from(answersTable)
    .where(eq(answersTable.schoolId, schoolId));
  const snapshots = await db
    .select({ enteredBy: teacherSnapshotsTable.enteredBy, enteredAt: teacherSnapshotsTable.enteredAt })
    .from(teacherSnapshotsTable)
    .where(eq(teacherSnapshotsTable.schoolId, schoolId));
  const answered = [...answers, ...snapshots].some(
    (r) => r.enteredAt > sentAt && isSchoolEntry(r.enteredBy),
  );
  return { sendStatus: answered ? "answered" : "sent_waiting", lastSentAt: sentAt.toISOString() };
}
