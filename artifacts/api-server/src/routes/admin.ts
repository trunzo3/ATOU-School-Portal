import { Router, type IRouter, type Response } from "express";
import { asc, desc, eq } from "drizzle-orm";
import {
  db,
  adminUsersTable,
  answersTable,
  appSettingsTable,
  contactsTable,
  emailSendsTable,
  infoPagesTable,
  schoolsTable,
  teacherSnapshotsTable,
} from "@workspace/db";
import {
  AdminLoginBody,
  SetSchoolLockBody,
  UpdateEmailTemplateBody,
  SendEmailsBody,
  CreateAdminUserBody,
  UpdateAdminUserBody,
  CreatePageBody,
  UpdatePageBody,
  UpdateSettingsBody,
  UpdateEmailSettingsBody,
  SendTestEmailBody,
} from "@workspace/api-zod";
import {
  PAM_EMAIL,
  clearSessionCookie,
  hashPassword,
  requireAdmin,
  setSessionCookie,
  verifyPassword,
  type AdminRequest,
} from "../lib/auth";
import { schoolLink } from "../lib/appUrl";
import { getQuestionStates, missingCount, normalizeEmail } from "../lib/answers";
import {
  EMAIL_FROM,
  emailConfigured,
  fillMergeFields,
  sendEmail,
} from "../lib/email";
import {
  DEFAULT_CANCELLATION_POLICY_URL,
  appendSignatureText,
  renderEmailHtml,
} from "../lib/signature";

const router: IRouter = Router();

function idParam(req: { params: Record<string, unknown> }): number {
  const raw = req.params["id"];
  return parseInt(Array.isArray(raw) ? String(raw[0]) : String(raw), 10);
}

function adminOut(a: { id: number; email: string; createdAt: Date }) {
  return { id: a.id, email: a.email, createdAt: a.createdAt.toISOString() };
}

function pageOut(p: {
  id: number;
  title: string;
  slug: string;
  body: string;
  sortOrder: number;
  published: boolean;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    body: p.body,
    sortOrder: p.sortOrder,
    published: p.published,
    updatedAt: p.updatedAt.toISOString(),
  };
}

// --- auth ---

router.post("/admin/login", async (req, res): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, email));
  if (!admin || !verifyPassword(parsed.data.password, admin.passwordHash)) {
    res.status(401).json({ error: "That email and password don't match." });
    return;
  }
  setSessionCookie(res, admin.id, admin.email);
  res.json(adminOut(admin));
});

// Temporary development-only login. Remove before going live.
router.post("/admin/dev-login", async (_req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const [pam] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, PAM_EMAIL));
  if (!pam) {
    res.status(500).json({ error: "Pam's account is missing." });
    return;
  }
  setSessionCookie(res, pam.id, pam.email);
  res.json(adminOut(pam));
});

router.post("/admin/logout", async (_req, res): Promise<void> => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/admin/me", requireAdmin, async (req: AdminRequest, res): Promise<void> => {
  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.id, req.admin!.id));
  if (!admin) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  res.json(adminOut(admin));
});

// --- schools grid ---

router.get("/admin/summary", requireAdmin, async (_req, res): Promise<void> => {
  const schools = await db.select().from(schoolsTable);
  let complete = 0;
  let partial = 0;
  let untouched = 0;
  for (const school of schools) {
    const states = await getQuestionStates(school.id);
    const missing = missingCount(states);
    const answeredAny = states.some((s) => s.answered);
    if (missing === 0) complete += 1;
    else if (answeredAny) partial += 1;
    else untouched += 1;
  }
  res.json({
    totalSchools: schools.length,
    complete,
    partial,
    untouched,
    locked: schools.filter((s) => s.locked).length,
  });
});

// Send status per school: never_sent, sent_waiting (sent, no school activity
// since), or answered (a school contact saved something after the last send).
async function schoolSendStatus(schoolId: number): Promise<{
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
  const isSchoolEntry = (enteredBy: string) =>
    normalizeEmail(enteredBy) !== PAM_EMAIL && enteredBy !== "Airtable import";
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

router.get("/admin/schools", requireAdmin, async (_req, res): Promise<void> => {
  const schools = await db.select().from(schoolsTable).orderBy(asc(schoolsTable.workshopDate));
  const rows = [];
  for (const school of schools) {
    const states = await getQuestionStates(school.id);
    const contacts = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.schoolId, school.id))
      .orderBy(asc(contactsTable.id));
    const { sendStatus, lastSentAt } = await schoolSendStatus(school.id);
    rows.push({
      id: school.id,
      name: school.name,
      code: school.code,
      link: schoolLink(school.code),
      workshopDate: school.workshopDate,
      locked: school.locked,
      approxStudents: school.approxStudents,
      questionStates: states,
      missingCount: missingCount(states),
      contacts: contacts.map((c) => ({ id: c.id, email: c.email, name: c.name })),
      sendStatus,
      lastSentAt,
    });
  }
  res.json(rows);
});

async function schoolDetail(schoolId: number, res: Response): Promise<void> {
  const [school] = await db.select().from(schoolsTable).where(eq(schoolsTable.id, schoolId));
  if (!school) {
    res.status(404).json({ error: "School not found." });
    return;
  }
  const contacts = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.schoolId, school.id))
    .orderBy(asc(contactsTable.id));
  res.json({
    id: school.id,
    name: school.name,
    code: school.code,
    link: schoolLink(school.code),
    workshopDate: school.workshopDate,
    locked: school.locked,
    approxStudents: school.approxStudents,
    contacts: contacts.map((c) => ({ id: c.id, email: c.email, name: c.name })),
  });
}

router.get("/admin/schools/:id", requireAdmin, async (req, res): Promise<void> => {
  await schoolDetail(idParam(req), res);
});

router.patch("/admin/schools/:id/lock", requireAdmin, async (req, res): Promise<void> => {
  const parsed = SetSchoolLockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "locked must be true or false." });
    return;
  }
  const id = idParam(req);
  await db.update(schoolsTable).set({ locked: parsed.data.locked }).where(eq(schoolsTable.id, id));
  await schoolDetail(id, res);
});

// --- email sending ---

const DEFAULT_SUBJECT =
  "Logistics needed for A Touch of Understanding Workshop - {{school_name}} - {{workshop_date}}";

const DEFAULT_TEMPLATE = `[Pam — this template needs your wording before it's used. Write the email in your own voice; {{school_name}}, {{workshop_date}}, and {{link}} are filled in automatically for each school.]

Hello,

...

Please fill in your workshop logistics for {{school_name}} ({{workshop_date}}) here: {{link}}

Thank you,
Pam
A Touch of Understanding`;

const EMAIL_SENDING_ENABLED_KEY = "email_sending_enabled";
const CANCELLATION_POLICY_URL_KEY = "cancellation_policy_url";

async function settingValue(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return row ? row.value : null;
}

async function saveSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

async function emailSendingEnabled(): Promise<boolean> {
  return (await settingValue(EMAIL_SENDING_ENABLED_KEY)) === "true";
}

async function cancellationPolicyUrl(): Promise<string> {
  const stored = (await settingValue(CANCELLATION_POLICY_URL_KEY))?.trim();
  return stored || DEFAULT_CANCELLATION_POLICY_URL;
}

router.get("/admin/template", requireAdmin, async (_req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "email_template"));
  const subject = await settingValue("email_template_subject");
  res.json({
    subject: subject ?? DEFAULT_SUBJECT,
    body: row ? row.value : DEFAULT_TEMPLATE,
    updatedAt: row ? row.updatedAt.toISOString() : null,
  });
});

router.put("/admin/template", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateEmailTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Template subject and body are required." });
    return;
  }
  await saveSetting("email_template_subject", parsed.data.subject);
  await saveSetting("email_template", parsed.data.body);
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "email_template"));
  res.json({
    subject: parsed.data.subject,
    body: parsed.data.body,
    updatedAt: row ? row.updatedAt.toISOString() : null,
  });
});

router.get("/admin/email-status", requireAdmin, async (_req, res): Promise<void> => {
  res.json({
    configured: emailConfigured(),
    enabled: await emailSendingEnabled(),
    from: EMAIL_FROM,
    cancellationPolicyUrl: await cancellationPolicyUrl(),
  });
});

router.put("/admin/email-settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateEmailSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email sending must be set to on or off." });
    return;
  }
  if (parsed.data.enabled && !emailConfigured()) {
    res.status(400).json({
      error: "Resend is not connected, so live email sending cannot be turned on.",
    });
    return;
  }
  const policyUrl = parsed.data.cancellationPolicyUrl?.trim();
  if (policyUrl !== undefined && policyUrl !== "" && !/^https?:\/\//i.test(policyUrl)) {
    res.status(400).json({
      error: "The cancellation policy link must be a full web address starting with http:// or https://.",
    });
    return;
  }
  await saveSetting(EMAIL_SENDING_ENABLED_KEY, String(parsed.data.enabled));
  if (policyUrl !== undefined) {
    await saveSetting(CANCELLATION_POLICY_URL_KEY, policyUrl);
  }
  res.json({
    configured: emailConfigured(),
    enabled: parsed.data.enabled,
    from: EMAIL_FROM,
    cancellationPolicyUrl: await cancellationPolicyUrl(),
  });
});

router.post("/admin/email/test", requireAdmin, async (req, res): Promise<void> => {
  const parsed = SendTestEmailBody.safeParse(req.body);
  const recipient = parsed.success ? parsed.data.email.trim() : "";
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient);
  if (!parsed.success || !validEmail) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  if (!emailConfigured()) {
    res.status(503).json({
      error: "Resend is not connected. Add the RESEND_API_KEY secret and try again.",
    });
    return;
  }
  const testBody = `This is a test email from the A Touch of Understanding workshop logistics app.

If you received it, Resend is connected and the sender address is working.

This test does not change the live email sending switch.`;
  const policyUrl = await cancellationPolicyUrl();
  const result = await sendEmail({
    to: [recipient],
    subject: "A Touch of Understanding email test",
    text: appendSignatureText(testBody, policyUrl),
    html: renderEmailHtml(testBody, policyUrl),
  });
  if (!result.delivered) {
    req.log.warn({ provider: "resend" }, "Test email was rejected");
    res.status(503).json({
      error: result.error ?? "Resend rejected the test email.",
    });
    return;
  }
  res.json({
    delivered: true,
    message: `Resend accepted a test email for ${recipient}.`,
    providerId: result.providerId ?? null,
  });
});

function sendOut(s: {
  id: number;
  schoolId: number;
  recipients: string[];
  subject: string;
  isFollowUp: boolean;
  delivered: boolean;
  sentBy: string;
  sentAt: Date;
}, schoolName: string) {
  return {
    id: s.id,
    schoolId: s.schoolId,
    schoolName,
    recipients: s.recipients,
    subject: s.subject,
    isFollowUp: s.isFollowUp,
    delivered: s.delivered,
    sentBy: s.sentBy,
    sentAt: s.sentAt.toISOString(),
  };
}

router.get("/admin/sends", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({ send: emailSendsTable, schoolName: schoolsTable.name })
    .from(emailSendsTable)
    .innerJoin(schoolsTable, eq(emailSendsTable.schoolId, schoolsTable.id))
    .orderBy(desc(emailSendsTable.sentAt), desc(emailSendsTable.id));
  res.json(rows.map((r) => sendOut(r.send, r.schoolName)));
});

router.post("/admin/send", requireAdmin, async (req: AdminRequest, res): Promise<void> => {
  const parsed = SendEmailsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Selected schools, a subject, and a message are required." });
    return;
  }
  const configured = emailConfigured();
  const enabled = await emailSendingEnabled();
  const liveDelivery = configured && enabled;
  const sentBy = req.admin?.email ?? PAM_EMAIL;
  const policyUrl = await cancellationPolicyUrl();
  const sends = [];
  const errors: string[] = [];
  for (const item of parsed.data.items) {
    const [school] = await db
      .select()
      .from(schoolsTable)
      .where(eq(schoolsTable.id, item.schoolId));
    if (!school) {
      errors.push(`School ${item.schoolId} not found.`);
      continue;
    }
    if (school.locked) {
      errors.push(`${school.name} is locked, so no email was sent to it.`);
      continue;
    }
    const recipients = item.emails.map((e) => e.trim()).filter((e) => e.length > 0);
    if (recipients.length === 0) {
      errors.push(`${school.name} has no recipients selected.`);
      continue;
    }
    const merge = {
      name: school.name,
      workshopDate: school.workshopDate,
      link: schoolLink(school.code),
    };
    // Subjects are single-line: strip any line breaks merge fields could carry.
    const subject = fillMergeFields(parsed.data.subject, merge).replace(/[\r\n]+/g, " ").trim();
    const body = fillMergeFields(parsed.data.message, merge);
    // Pam's signature is appended automatically to both email parts.
    const result = liveDelivery
      ? await sendEmail({
          to: recipients,
          subject,
          text: appendSignatureText(body, policyUrl),
          html: renderEmailHtml(body, policyUrl),
        })
      : { delivered: false };
    if (liveDelivery && !result.delivered) {
      // A real delivery attempt failed: report it and don't log it as a send.
      errors.push(`${school.name}: ${result.error ?? "The email service rejected the send."}`);
      continue;
    }
    const priorSends = await db
      .select({ id: emailSendsTable.id })
      .from(emailSendsTable)
      .where(eq(emailSendsTable.schoolId, school.id))
      .limit(1);
    const [row] = await db
      .insert(emailSendsTable)
      .values({
        schoolId: school.id,
        recipients,
        subject,
        body,
        isFollowUp: priorSends.length > 0,
        delivered: result.delivered,
        sentBy,
      })
      .returning();
    sends.push(sendOut(row!, school.name));
  }
  res.json({ configured, enabled, sends, errors });
});

// --- admin accounts ---

router.get("/admin/admins", requireAdmin, async (_req, res): Promise<void> => {
  const admins = await db.select().from(adminUsersTable).orderBy(asc(adminUsersTable.id));
  res.json(admins.map(adminOut));
});

router.post("/admin/admins", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and a password of at least 8 characters are required." });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const existing = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "An admin with that email already exists." });
    return;
  }
  const [admin] = await db
    .insert(adminUsersTable)
    .values({ email, passwordHash: hashPassword(parsed.data.password) })
    .returning();
  res.status(201).json(adminOut(admin!));
});

router.patch("/admin/admins/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  const [admin] = await db
    .update(adminUsersTable)
    .set({ passwordHash: hashPassword(parsed.data.password) })
    .where(eq(adminUsersTable.id, idParam(req)))
    .returning();
  if (!admin) {
    res.status(404).json({ error: "Admin not found." });
    return;
  }
  res.json(adminOut(admin));
});

router.delete("/admin/admins/:id", requireAdmin, async (req, res): Promise<void> => {
  const admins = await db.select().from(adminUsersTable);
  if (admins.length <= 1) {
    res.status(400).json({ error: "You can't remove the last admin account." });
    return;
  }
  const id = idParam(req);
  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, id));
  res.json({ ok: true });
});

// --- info pages ---

router.get("/admin/pages", requireAdmin, async (_req, res): Promise<void> => {
  const pages = await db
    .select()
    .from(infoPagesTable)
    .orderBy(asc(infoPagesTable.sortOrder), asc(infoPagesTable.id));
  res.json(pages.map(pageOut));
});

router.post("/admin/pages", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Title, web address, and body are required." });
    return;
  }
  const [page] = await db
    .insert(infoPagesTable)
    .values({
      title: parsed.data.title,
      slug: parsed.data.slug,
      body: parsed.data.body,
      sortOrder: parsed.data.sortOrder ?? 0,
      published: parsed.data.published ?? false,
    })
    .returning();
  res.status(201).json(pageOut(page!));
});

router.patch("/admin/pages/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdatePageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid page update." });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates["title"] = parsed.data.title;
  if (parsed.data.slug !== undefined) updates["slug"] = parsed.data.slug;
  if (parsed.data.body !== undefined) updates["body"] = parsed.data.body;
  if (parsed.data.sortOrder !== undefined) updates["sortOrder"] = parsed.data.sortOrder;
  if (parsed.data.published !== undefined) updates["published"] = parsed.data.published;
  const [page] = await db
    .update(infoPagesTable)
    .set(updates)
    .where(eq(infoPagesTable.id, idParam(req)))
    .returning();
  if (!page) {
    res.status(404).json({ error: "Page not found." });
    return;
  }
  res.json(pageOut(page));
});

router.delete("/admin/pages/:id", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(infoPagesTable).where(eq(infoPagesTable.id, idParam(req)));
  res.json({ ok: true });
});

router.get("/admin/pages/export", requireAdmin, async (_req, res): Promise<void> => {
  const pages = await db
    .select()
    .from(infoPagesTable)
    .orderBy(asc(infoPagesTable.sortOrder), asc(infoPagesTable.id));
  res.json({ exportedAt: new Date().toISOString(), pages: pages.map(pageOut) });
});

// --- Airtable settings (stored, connection stays OFF) ---

router.get("/admin/settings", requireAdmin, async (_req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "airtable"));
  let cfg = { apiKey: "", baseId: "", tableId: "" };
  if (row) {
    try {
      cfg = { ...cfg, ...(JSON.parse(row.value) as Partial<typeof cfg>) };
    } catch {
      // ignore malformed settings
    }
  }
  res.json({
    apiKeySet: cfg.apiKey.length > 0,
    baseId: cfg.baseId,
    tableId: cfg.tableId,
    enabled: false, // connection stays off in this build
  });
});

router.put("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings." });
    return;
  }
  await db
    .insert(appSettingsTable)
    .values({ key: "airtable", value: JSON.stringify(parsed.data) })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: JSON.stringify(parsed.data), updatedAt: new Date() },
    });
  res.json({
    apiKeySet: parsed.data.apiKey.length > 0,
    baseId: parsed.data.baseId,
    tableId: parsed.data.tableId,
    enabled: false,
  });
});

export default router;
