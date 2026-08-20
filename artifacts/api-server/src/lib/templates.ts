import { eq } from "drizzle-orm";
import { db, emailTemplatesTable, type EmailTemplateRow } from "@workspace/db";
import { PLAIN_SIGNATURE, ensurePlainSignature, hasPlainSignature } from "./email";
import { settingValue } from "./settings";

export const DEFAULT_SUBJECT =
  "Logistics needed for A Touch of Understanding Workshop - {{school_name}} - {{workshop_date}}";

export const DEFAULT_TEMPLATE = `[Pam — this template needs your wording before it's used. Write the email in your own voice; {{school_name}}, {{workshop_date}}, and {{link}} are filled in automatically for each school.]

Hello,

...

Please fill in your workshop logistics for {{school_name}} ({{workshop_date}}) here: {{link}}

Thank you,
Pam

${PLAIN_SIGNATURE}`;

// The follow-up template shares the same subject line as the request template.
export const FOLLOW_UP_BODY = `Hello,

I'm sorry to bother you again however your workshop is quickly approaching and we need to gather the logistics.

Please complete your workshop logistics here: {{link}}

Thank you,
Pam

${PLAIN_SIGNATURE}`;

// Seed the named templates once. The "Logistics Request" template inherits any
// wording Pam already saved under the old single-template settings keys.
// Every template body ends with Pam's plain contact block: it is part of the
// editable message now that no signature is appended at send time, so
// templates saved while the old automatic signature stripped the typed block
// get it restored here without touching the administrator's own wording.
export async function ensureEmailTemplates(): Promise<void> {
  const existing = await db.select().from(emailTemplatesTable);
  if (existing.length > 0) {
    for (const t of existing) {
      if (!hasPlainSignature(t.body)) {
        await db
          .update(emailTemplatesTable)
          .set({ body: ensurePlainSignature(t.body) })
          .where(eq(emailTemplatesTable.id, t.id));
      }
    }
    return;
  }
  const savedSubject = await settingValue("email_template_subject");
  const savedBodyRaw = await settingValue("email_template");
  const savedBody = savedBodyRaw === null ? null : ensurePlainSignature(savedBodyRaw);
  await db
    .insert(emailTemplatesTable)
    .values([
      {
        id: "logistics-request",
        name: "Logistics Request",
        subject: savedSubject ?? DEFAULT_SUBJECT,
        body: savedBody ?? DEFAULT_TEMPLATE,
        sortOrder: 0,
      },
      {
        id: "logistics-follow-up",
        name: "Logistics Follow-Up",
        subject: DEFAULT_SUBJECT,
        body: FOLLOW_UP_BODY,
        sortOrder: 1,
      },
    ])
    .onConflictDoNothing();
}

/** The template the automatic logistics email uses, with a safe fallback. */
export async function getTemplateById(id: string): Promise<EmailTemplateRow | null> {
  await ensureEmailTemplates();
  const [row] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  if (row) return row;
  const [first] = await db.select().from(emailTemplatesTable).orderBy(emailTemplatesTable.sortOrder);
  return first ?? null;
}
