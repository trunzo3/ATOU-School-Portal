import { Router, type IRouter, type Response } from "express";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import {
  db,
  adminUsersTable,
  passwordResetTokensTable,
  answersTable,
  contactsTable,
  emailSendsTable,
  emailTemplatesTable,
  type EmailTemplateRow,
  infoPagesTable,
  learningLabVideosTable,
  type LearningLabVideoRow,
  schoolsTable,
  teacherSnapshotsTable,
} from "@workspace/db";
import crypto from "node:crypto";
import { pendingSendDate } from "../lib/pending-send";
import {
  AdminLoginBody,
  AdminForgotPasswordBody,
  AdminResetPasswordBody,
  SetSchoolLockBody,
  UpdateEmailTemplateBody,
  SendEmailsBody,
  UpdateAutoLogisticsBody,
  UpdateWeeklySummaryBody,
  SetAutoSendSkipBody,
  CreateAdminUserBody,
  UpdateAdminUserBody,
  CreatePageBody,
  UpdatePageBody,
  CreateLearningLabVideoBody,
  UpdateLearningLabVideoBody,
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
import { appBaseUrl, schoolLink } from "../lib/appUrl";
import { checkAirtableConnection, isAirtableConfigured } from "../lib/airtable";
import {
  airtableDevOverrideActive,
  airtableSyncAllowed,
  environmentName,
} from "../lib/environment";
import { getAirtableSyncStatus, runAirtableSyncNow } from "../lib/airtable-sync";
import { getQuestionStates, missingCount, normalizeEmail } from "../lib/answers";
import {
  EMAIL_FROM,
  emailConfigured,
  fillMergeFields,
  renderEmailHtml,
  sendEmail,
} from "../lib/email";
import {
  EMAIL_SENDING_ENABLED_KEY,
  emailSendingEnabled,
  getLogisticsAutoSettings,
  getWeeklySummarySettings,
  logisticsRulesProblem,
  normalizeLogisticsRules,
  normalizeRecipients,
  saveLogisticsAutoSettings,
  saveSetting,
  claimWeeklySend,
  saveWeeklySummarySettingsKeepingLastSent,
  settingValue,
} from "../lib/settings";
import {
  FOLLOW_UP_TEMPLATE_ID,
  REQUEST_TEMPLATE_ID,
  ensureEmailTemplates,
} from "../lib/templates";
import { schoolSendStatus } from "../lib/send-status";
import { parseVideoUrl } from "../lib/video-embed";
import { buildSummaryReport, renderWeeklyEmail } from "../lib/summary";
import { addDays, pacificToday } from "../lib/dates";

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

// --- password reset ---

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour
const NEUTRAL_RESET_MESSAGE =
  "If that email matches an account, a password reset link has been sent.";

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Basic in-memory guard: at most 3 reset requests per email per 15 minutes.
const resetRequestLog = new Map<string, number[]>();
function resetRequestAllowed(email: string): boolean {
  const now = Date.now();
  const windowMs = 1000 * 60 * 15;
  const recent = (resetRequestLog.get(email) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= 3) {
    resetRequestLog.set(email, recent);
    return false;
  }
  recent.push(now);
  resetRequestLog.set(email, recent);
  return true;
}

router.post("/admin/forgot-password", async (req, res): Promise<void> => {
  const parsed = AdminForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your email address." });
    return;
  }
  // Password resets are operational email: they only need Resend to be
  // configured, independent of the school-mailing on/off switch.
  if (!emailConfigured()) {
    res.status(503).json({
      sent: false,
      message:
        "Password reset emails can't be sent right now. Please contact an administrator to reset your password.",
    });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  if (!resetRequestAllowed(email)) {
    res.status(429).json({
      error: "Too many reset requests. Please wait a few minutes and try again.",
    });
    return;
  }
  const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, email));
  if (admin) {
    const token = crypto.randomBytes(32).toString("base64url");
    await db.insert(passwordResetTokensTable).values({
      adminId: admin.id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });
    const resetLink = `${appBaseUrl()}/reset-password?token=${token}`;
    const body = `A password reset was requested for your A Touch of Understanding admin account.

Set a new password here (this link works once and expires in 1 hour):
${resetLink}

If you didn't request this, you can ignore this email — your password is unchanged.`;
    const result = await sendEmail({
      to: [admin.email],
      subject: "Reset your A Touch of Understanding admin password",
      text: body,
    });
    if (!result.delivered) {
      req.log.warn({ provider: "resend" }, "Password reset email was rejected");
      // Stay neutral to the caller: don't reveal that the account exists.
    }
  }
  res.json({ sent: true, message: NEUTRAL_RESET_MESSAGE });
});

router.post("/admin/reset-password", async (req, res): Promise<void> => {
  const parsed = AdminResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "A reset token and a new password of at least 8 characters are required.",
    });
    return;
  }
  const newPasswordHash = hashPassword(parsed.data.password);
  // Claim the token atomically (single-use): the conditional UPDATE marks it
  // used only if it is still unused and unexpired, so concurrent requests
  // with the same link can't both succeed.
  const reset = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, hashResetToken(parsed.data.token)),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!claimed) return false;
    await tx
      .update(adminUsersTable)
      .set({ passwordHash: newPasswordHash, passwordChangedAt: new Date() })
      .where(eq(adminUsersTable.id, claimed.adminId));
    return true;
  });
  if (!reset) {
    res.status(400).json({
      error: "This reset link is invalid, expired, or already used. Please request a new one.",
    });
    return;
  }
  res.json({ ok: true });
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
  // The environment is server-reported so the sidebar indicator reflects
  // which database this API server is actually using, not a build flag.
  res.json({ ...adminOut(admin), environment: environmentName() });
});

// --- schools grid ---

router.get("/admin/summary", requireAdmin, async (_req, res): Promise<void> => {
  const schools = await db.select().from(schoolsTable);
  let complete = 0;
  let partial = 0;
  let untouched = 0;
  for (const school of schools) {
    const states = await getQuestionStates(school);
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

// Pending send: the date the logistics email is due to reach the school —
// the configured days-before window ahead of the workshop. Only meaningful
// while nothing has been sent yet; skipped schools show nothing.
router.get("/admin/schools", requireAdmin, async (_req, res): Promise<void> => {
  const schools = await db.select().from(schoolsTable).orderBy(asc(schoolsTable.workshopDate));
  const logistics = await getLogisticsAutoSettings();
  // The Pending Send column is about a school's FIRST email, so it follows
  // the first-contact rule (the request template); the follow-up rule never
  // applies to a never-emailed school.
  const requestRule = logistics.rules.find((r) => r.templateId === REQUEST_TEMPLATE_ID);
  const rows = [];
  for (const school of schools) {
    const states = await getQuestionStates(school);
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
      pendingSendDate: pendingSendDate(school.workshopDate, sendStatus, {
        skipped: school.autoSendSkipped,
        daysBefore: requestRule?.daysBefore ?? 60,
        autoEnabled: logistics.enabled && requestRule !== undefined,
      }),
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
  const sendRows = await db
    .select()
    .from(emailSendsTable)
    .where(eq(emailSendsTable.schoolId, school.id))
    .orderBy(desc(emailSendsTable.sentAt), desc(emailSendsTable.id));
  // The school's automatic-send outlook: the next rule that would actually
  // fire for this school, as things stand today. The first-contact rule only
  // applies while the school has never been emailed; the follow-up rule only
  // once it has been emailed, hasn't had a follow-up, and still has gaps.
  const logistics = await getLogisticsAutoSettings();
  let scheduledDate: string | null = null;
  if (logistics.enabled && school.workshopDate && !school.autoSendSkipped && !school.locked) {
    const today = pacificToday();
    const hasAnySend = sendRows.length > 0;
    const hasFollowUp = sendRows.some((r) => r.isFollowUp);
    for (const rule of logistics.rules) {
      const due = addDays(school.workshopDate, -rule.daysBefore);
      if (!due || due < today) continue;
      if (rule.templateId === FOLLOW_UP_TEMPLATE_ID) {
        if (!hasAnySend || hasFollowUp) continue;
        const states = await getQuestionStates(school);
        if (missingCount(states) === 0) continue;
      } else if (hasAnySend) {
        continue;
      }
      if (!scheduledDate || due < scheduledDate) scheduledDate = due;
    }
  }
  res.json({
    id: school.id,
    name: school.name,
    code: school.code,
    link: schoolLink(school.code),
    workshopDate: school.workshopDate,
    locked: school.locked,
    approxStudents: school.approxStudents,
    contacts: contacts.map((c) => ({ id: c.id, email: c.email, name: c.name })),
    sendHistory: sendRows.map((r) => sendOut(r, school.name)),
    autoSend: { skipped: school.autoSendSkipped, scheduledDate },
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

function templateOut(t: EmailTemplateRow) {
  return {
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/admin/templates", requireAdmin, async (_req, res): Promise<void> => {
  await ensureEmailTemplates();
  const rows = await db
    .select()
    .from(emailTemplatesTable)
    .orderBy(asc(emailTemplatesTable.sortOrder), asc(emailTemplatesTable.name));
  res.json(rows.map(templateOut));
});

router.put("/admin/templates/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateEmailTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Template subject and body are required." });
    return;
  }
  await ensureEmailTemplates();
  const id = String(req.params["id"]);
  const [row] = await db
    .update(emailTemplatesTable)
    .set({ subject: parsed.data.subject, body: parsed.data.body })
    .where(eq(emailTemplatesTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "That template no longer exists." });
    return;
  }
  res.json(templateOut(row));
});

router.get("/admin/email-status", requireAdmin, async (_req, res): Promise<void> => {
  res.json({
    configured: emailConfigured(),
    enabled: await emailSendingEnabled(),
    from: EMAIL_FROM,
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
  await saveSetting(EMAIL_SENDING_ENABLED_KEY, String(parsed.data.enabled));
  res.json({
    configured: emailConfigured(),
    enabled: parsed.data.enabled,
    from: EMAIL_FROM,
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
  const result = await sendEmail({
    to: [recipient],
    subject: "A Touch of Understanding email test",
    text: testBody,
    html: renderEmailHtml(testBody),
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
  source: string;
  templateName: string | null;
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
    source: s.source,
    templateName: s.templateName,
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
    // The message is sent exactly as composed — Pam's contact block lives in
    // the body itself, so nothing is appended to either email part.
    const result = liveDelivery
      ? await sendEmail({
          to: recipients,
          subject,
          text: body,
          html: renderEmailHtml(body),
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
        source: "manual",
        templateName: parsed.data.templateName?.trim() || null,
      })
      .returning();
    sends.push(sendOut(row!, school.name));
  }
  res.json({ configured, enabled, sends, errors });
});

// --- weekly summary & automatic emails ---

router.get("/admin/summary-report", requireAdmin, async (_req, res): Promise<void> => {
  const weekly = await getWeeklySummarySettings();
  res.json(await buildSummaryReport(weekly.daysAhead));
});

async function automationOut() {
  const logistics = await getLogisticsAutoSettings();
  const weekly = await getWeeklySummarySettings();
  return { logistics, weekly };
}

router.get("/admin/automation", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await automationOut());
});

router.put("/admin/automation/logistics", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateAutoLogisticsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Each rule needs a template and a number of days before the workshop." });
    return;
  }
  const rules = normalizeLogisticsRules(parsed.data.rules);
  if (rules.length !== parsed.data.rules.length) {
    res.status(400).json({ error: "Each template can only be used by one rule." });
    return;
  }
  if (parsed.data.enabled && rules.length === 0) {
    res.status(400).json({ error: "Add a rule before turning automatic emails on." });
    return;
  }
  const problem = logisticsRulesProblem(rules);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  await ensureEmailTemplates();
  for (const rule of rules) {
    const [template] = await db
      .select({ id: emailTemplatesTable.id })
      .from(emailTemplatesTable)
      .where(eq(emailTemplatesTable.id, rule.templateId));
    if (!template) {
      res.status(400).json({ error: "That email template no longer exists." });
      return;
    }
  }
  await saveLogisticsAutoSettings({
    enabled: parsed.data.enabled && rules.length > 0,
    rules,
  });
  res.json(await automationOut());
});

router.put("/admin/automation/weekly", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateWeeklySummaryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Day of week, days ahead, and recipients are required." });
    return;
  }
  const recipients = normalizeRecipients(parsed.data.recipients);
  if (parsed.data.enabled && recipients.length === 0) {
    res.status(400).json({ error: "Add at least one recipient before turning the weekly summary on." });
    return;
  }
  // The stored lastSentAt always wins inside this save, so a form submit
  // can never erase a send timestamp the daily job wrote concurrently.
  await saveWeeklySummarySettingsKeepingLastSent({
    enabled: parsed.data.enabled,
    dayOfWeek: parsed.data.dayOfWeek,
    daysAhead: parsed.data.daysAhead,
    recipients,
    lastSentAt: null,
  });
  res.json(await automationOut());
});

router.post(
  "/admin/automation/weekly/send-now",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const weekly = await getWeeklySummarySettings();
    if (weekly.recipients.length === 0) {
      res.status(400).json({ error: "Add at least one recipient first." });
      return;
    }
    if (!emailConfigured()) {
      res.status(503).json({
        error: "Resend is not connected. Add the RESEND_API_KEY secret and try again.",
      });
      return;
    }
    // Claim before sending, exactly like the daily job, so Send now can
    // never overlap with the scheduled send (or a double-click) and deliver
    // the summary twice. Send now works whether or not the switch is on.
    const claimed = await claimWeeklySend(weekly.lastSentAt, new Date().toISOString());
    if (!claimed) {
      res.status(409).json({
        error: "A summary email is going out right now. Give it a moment, then check the last-sent time.",
      });
      return;
    }
    const report = await buildSummaryReport(weekly.daysAhead);
    const { subject, text } = renderWeeklyEmail(report);
    const result = await sendEmail({
      to: weekly.recipients,
      subject,
      text,
      html: renderEmailHtml(text),
    });
    if (!result.delivered) {
      res.status(503).json({ error: result.error ?? "Resend rejected the summary email." });
      return;
    }
    res.json(await automationOut());
  },
);

router.patch("/admin/schools/:id/auto-send", requireAdmin, async (req, res): Promise<void> => {
  const parsed = SetAutoSendSkipBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "skipped must be true or false." });
    return;
  }
  const id = idParam(req);
  await db
    .update(schoolsTable)
    .set({ autoSendSkipped: parsed.data.skipped })
    .where(eq(schoolsTable.id, id));
  await schoolDetail(id, res);
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

router.patch("/admin/admins/:id", requireAdmin, async (req: AdminRequest, res): Promise<void> => {
  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  const [admin] = await db
    .update(adminUsersTable)
    // Invalidate sessions issued before this change so old cookies stop working.
    .set({ passwordHash: hashPassword(parsed.data.password), passwordChangedAt: new Date() })
    .where(eq(adminUsersTable.id, idParam(req)))
    .returning();
  if (!admin) {
    res.status(404).json({ error: "Admin not found." });
    return;
  }
  // If the caller changed their own password, refresh their cookie so they
  // stay signed in on this device.
  if (req.admin?.id === admin.id) {
    setSessionCookie(res, admin.id, admin.email);
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

// Build a web address slug from a page title: lowercase, spaces become
// hyphens, punctuation dropped. Falls back to "page" if nothing survives.
function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/[\s-]+/g, "-") || "page"
  );
}

router.post("/admin/pages", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Title and body are required." });
    return;
  }
  // Slug is server-generated from the title (admins never see it); a
  // number is appended if the slug is already taken. Existing pages keep
  // their slugs forever so shared links don't break.
  let slug = parsed.data.slug;
  if (!slug) {
    const existing = new Set(
      (await db.select({ slug: infoPagesTable.slug }).from(infoPagesTable)).map((r) => r.slug),
    );
    const base = slugifyTitle(parsed.data.title);
    slug = base;
    for (let n = 2; existing.has(slug); n++) slug = `${base}-${n}`;
  }
  const [page] = await db
    .insert(infoPagesTable)
    .values({
      title: parsed.data.title,
      slug,
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

// --- Learning Lab videos ---

const BAD_VIDEO_URL_MESSAGE =
  "That doesn't look like a YouTube or Vimeo video link. Paste the full URL of a single video (for example https://www.youtube.com/watch?v=... or https://vimeo.com/...).";

function videoOut(v: LearningLabVideoRow) {
  return {
    id: v.id,
    title: v.title,
    videoUrl: v.videoUrl,
    // Derived fresh from the stored link so embed logic lives in one place
    // (and Vimeo privacy hashes survive).
    embedUrl: parseVideoUrl(v.videoUrl)?.embedUrl ?? "",
    publishedOn: v.publishedOn,
    description: v.description,
    updatedAt: v.updatedAt.toISOString(),
  };
}

router.get("/admin/videos", requireAdmin, async (_req, res): Promise<void> => {
  const videos = await db
    .select()
    .from(learningLabVideosTable)
    .orderBy(desc(learningLabVideosTable.publishedOn), desc(learningLabVideosTable.id));
  res.json(videos.map(videoOut));
});

router.post("/admin/videos", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateLearningLabVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "A title, a video link, and a publication date are required.",
    });
    return;
  }
  if (!parseVideoUrl(parsed.data.videoUrl)) {
    res.status(400).json({ error: BAD_VIDEO_URL_MESSAGE });
    return;
  }
  const [video] = await db
    .insert(learningLabVideosTable)
    .values({
      title: parsed.data.title,
      videoUrl: parsed.data.videoUrl.trim(),
      publishedOn: parsed.data.publishedOn,
      description: parsed.data.description ?? "",
    })
    .returning();
  res.status(201).json(videoOut(video!));
});

router.patch("/admin/videos/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateLearningLabVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid video update." });
    return;
  }
  if (parsed.data.videoUrl !== undefined && !parseVideoUrl(parsed.data.videoUrl)) {
    res.status(400).json({ error: BAD_VIDEO_URL_MESSAGE });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates["title"] = parsed.data.title;
  if (parsed.data.videoUrl !== undefined) updates["videoUrl"] = parsed.data.videoUrl.trim();
  if (parsed.data.publishedOn !== undefined) updates["publishedOn"] = parsed.data.publishedOn;
  if (parsed.data.description !== undefined) updates["description"] = parsed.data.description;
  const [video] = await db
    .update(learningLabVideosTable)
    .set(updates)
    .where(eq(learningLabVideosTable.id, idParam(req)))
    .returning();
  if (!video) {
    res.status(404).json({ error: "Video not found." });
    return;
  }
  res.json(videoOut(video));
});

router.delete("/admin/videos/:id", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(learningLabVideosTable).where(eq(learningLabVideosTable.id, idParam(req)));
  res.json({ ok: true });
});

// --- Airtable connection & sync (live, via the Replit Airtable connection) ---

async function airtableStatusOut() {
  const status = await getAirtableSyncStatus();
  const syncAllowed = airtableSyncAllowed();
  return {
    // When sync is disabled by environment, don't even probe Airtable —
    // dev stays fully isolated, and the UI reports the environment gate
    // instead of pretending the connector is active.
    connected: syncAllowed ? await checkAirtableConnection() : false,
    environment: environmentName(),
    syncAllowed,
    devOverrideActive: airtableDevOverrideActive(),
    syncing: status.runningSince !== null,
    lastSyncAt: status.lastSyncAt,
    lastSyncOk: status.lastSyncOk,
    lastSyncMessage: status.lastSyncMessage,
  };
}

router.get("/admin/airtable/status", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await airtableStatusOut());
});

router.post("/admin/airtable/sync", requireAdmin, async (_req, res): Promise<void> => {
  if (!airtableSyncAllowed()) {
    res.status(503).json({
      error:
        "Airtable sync is disabled in development — only the production app syncs. (To test sync from here, set AIRTABLE_SYNC_DEV_OVERRIDE=true.)",
    });
    return;
  }
  if (!isAirtableConfigured()) {
    res.status(503).json({
      error: "The Airtable connection is not available in this environment.",
    });
    return;
  }
  // Same claim as the scheduled sync, so Sync now can never run a second
  // pass on top of one already in flight.
  const result = await runAirtableSyncNow();
  if (result.busy) {
    res.status(409).json({
      error: "A sync is already running. Give it a moment, then refresh.",
    });
    return;
  }
  res.json(await airtableStatusOut());
});

export default router;
