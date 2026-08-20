// The daily automation, shared by the in-server scheduler (lib/scheduler.ts)
// and the manual script (jobs/daily.ts). It does two things, both driven by
// the settings Pam controls in the app:
//  1. Automatic logistics requests: emails schools whose workshop is exactly
//     the configured number of days away, that have never been emailed and
//     aren't skipped or locked.
//  2. The weekly summary email, on the configured day of the week.
//
// Every send is claimed in the database BEFORE the email goes out, so
// overlapping runs (two server instances, the script and the server, a
// Send now click during the scheduled run) can never send anything twice.
import { asc, eq, sql } from "drizzle-orm";
import {
  db,
  contactsTable,
  emailSendsTable,
  emailTemplatesTable,
  schoolsTable,
} from "@workspace/db";
import {
  claimWeeklySend,
  emailSendingEnabled,
  getLogisticsAutoSettings,
  getWeeklySummarySettings,
  type LogisticsRule,
} from "./settings";
import { FOLLOW_UP_TEMPLATE_ID, ensureEmailTemplates } from "./templates";
import { getQuestionStates, missingCount } from "./answers";
import { emailConfigured, fillMergeFields, renderEmailHtml, sendEmail } from "./email";
import { schoolLink } from "./appUrl";
import { buildSummaryReport, renderWeeklyEmail } from "./summary";
import { addDays, pacificToday, pacificWeekday } from "./dates";

export type AutomationLog = (msg: string) => void;

export async function runAutoLogistics(log: AutomationLog): Promise<void> {
  const settings = await getLogisticsAutoSettings();
  if (!settings.enabled || settings.rules.length === 0) {
    log("Automatic logistics emails are off; skipping.");
    return;
  }
  if (!emailConfigured()) {
    log("Resend is not connected; no logistics emails sent.");
    return;
  }
  if (!(await emailSendingEnabled())) {
    log("Live email sending to schools is switched off; no logistics emails sent.");
    return;
  }
  await ensureEmailTemplates();
  const today = pacificToday();
  for (const rule of settings.rules) {
    await runLogisticsRule(rule, today, log);
  }
}

// One rule = one template on one day. The follow-up template is a reminder,
// so it only goes to schools that were emailed before, haven't had a
// follow-up yet, and still have logistics missing. Any other template is a
// first contact and only goes to schools that have never been emailed at all.
async function runLogisticsRule(
  rule: LogisticsRule,
  today: string,
  log: AutomationLog,
): Promise<void> {
  const targetDate = addDays(today, rule.daysBefore);
  if (!targetDate) return;
  const [template] = await db
    .select()
    .from(emailTemplatesTable)
    .where(eq(emailTemplatesTable.id, rule.templateId));
  if (!template) {
    log(`A rule points at a template that no longer exists (${rule.templateId}); it sent nothing.`);
    return;
  }
  const isFollowUpRule = rule.templateId === FOLLOW_UP_TEMPLATE_ID;
  const schools = await db
    .select()
    .from(schoolsTable)
    .where(eq(schoolsTable.workshopDate, targetDate));
  log(
    `Workshops on ${targetDate} (${template.name}, ${rule.daysBefore} days out): ${schools.length} school(s).`,
  );
  for (const school of schools) {
    if (school.autoSendSkipped) {
      log(`${school.name}: skipped by Pam; not sending.`);
      continue;
    }
    if (school.locked) {
      log(`${school.name}: locked; not sending.`);
      continue;
    }
    const prior = await db
      .select({ id: emailSendsTable.id, isFollowUp: emailSendsTable.isFollowUp })
      .from(emailSendsTable)
      .where(eq(emailSendsTable.schoolId, school.id));
    if (isFollowUpRule) {
      if (prior.length === 0) continue; // never contacted; a "sorry to bother you again" makes no sense
      if (prior.some((p) => p.isFollowUp)) continue; // already reminded once
      const states = await getQuestionStates(school);
      if (missingCount(states) === 0) {
        log(`${school.name}: logistics are complete; no follow-up needed.`);
        continue;
      }
    } else if (prior.length > 0) {
      continue; // first contact only for schools never emailed
    }
    const contacts = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.schoolId, school.id))
      .orderBy(asc(contactsTable.id));
    const recipients = contacts.map((c) => c.email.trim()).filter((e) => e.length > 0);
    if (recipients.length === 0) {
      log(`${school.name}: no contacts on file; not sending.`);
      continue;
    }
    const merge = {
      name: school.name,
      workshopDate: school.workshopDate,
      link: schoolLink(school.code),
    };
    const subject = fillMergeFields(template.subject, merge).replace(/[\r\n]+/g, " ").trim();
    const body = fillMergeFields(template.body, merge);
    // Claim the send BEFORE talking to Resend: inside one transaction, an
    // advisory lock on the school serializes overlapping runs, the switch,
    // the rule, skip flag, lock, and history checks re-run under that lock,
    // and the record is written as not-yet-delivered. If two runs overlap,
    // or the process crashes between delivery and recording, the school
    // still can't be emailed twice.
    const claimId = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(823001, ${school.id})`);
      const freshSettings = await getLogisticsAutoSettings();
      if (!freshSettings.enabled) return null;
      const freshRule = freshSettings.rules.find((r) => r.templateId === rule.templateId);
      if (!freshRule || freshRule.daysBefore !== rule.daysBefore) return null;
      const [freshSchool] = await tx
        .select({ skipped: schoolsTable.autoSendSkipped, locked: schoolsTable.locked })
        .from(schoolsTable)
        .where(eq(schoolsTable.id, school.id));
      if (!freshSchool || freshSchool.skipped || freshSchool.locked) return null;
      const existing = await tx
        .select({ id: emailSendsTable.id, isFollowUp: emailSendsTable.isFollowUp })
        .from(emailSendsTable)
        .where(eq(emailSendsTable.schoolId, school.id));
      if (isFollowUpRule) {
        if (existing.length === 0 || existing.some((p) => p.isFollowUp)) return null;
        // Re-check completeness under the lock too: a school that finished
        // its logistics moments ago must not get a needless reminder.
        const freshStates = await getQuestionStates(school);
        if (missingCount(freshStates) === 0) return null;
      } else if (existing.length > 0) {
        return null;
      }
      const [row] = await tx
        .insert(emailSendsTable)
        .values({
          schoolId: school.id,
          recipients,
          subject,
          body,
          isFollowUp: isFollowUpRule,
          delivered: false,
          sentBy: "Automatic",
          source: "automatic",
          templateName: template.name,
        })
        .returning({ id: emailSendsTable.id });
      return row!.id;
    });
    if (claimId === null) {
      continue;
    }
    const result = await sendEmail({
      to: recipients,
      subject,
      text: body,
      html: renderEmailHtml(body),
    });
    if (result.delivered) {
      await db
        .update(emailSendsTable)
        .set({ delivered: true })
        .where(eq(emailSendsTable.id, claimId));
      log(`${school.name}: ${template.name} sent to ${recipients.length} recipient(s).`);
    } else {
      // The claim stays in the log as "Not delivered" so it's visible in the
      // app, and the school won't be retried (its exact send day has passed).
      log(`${school.name}: delivery failed (${result.error ?? "rejected"}); recorded as not delivered.`);
    }
  }
}

export async function runWeeklySummary(log: AutomationLog): Promise<void> {
  const settings = await getWeeklySummarySettings();
  if (!settings.enabled) {
    log("Weekly summary email is off; skipping.");
    return;
  }
  if (pacificWeekday() !== settings.dayOfWeek) {
    log("Not the configured day of the week; no weekly summary sent.");
    return;
  }
  const today = pacificToday();
  if (settings.lastSentAt && pacificToday(new Date(settings.lastSentAt)) === today) {
    log("Weekly summary already went out today; not sending again.");
    return;
  }
  if (settings.recipients.length === 0) {
    log("Weekly summary has no recipients; nothing sent.");
    return;
  }
  if (!emailConfigured()) {
    log("Resend is not connected; weekly summary not sent.");
    return;
  }
  // Claim this week's send before delivering: the claim writes lastSentAt
  // atomically (and fails if the switch was turned off meanwhile), so an
  // overlapping run sees it and backs off — the summary can never arrive
  // twice.
  const claimed = await claimWeeklySend(settings.lastSentAt, new Date().toISOString(), {
    requireEnabled: true,
  });
  if (!claimed) {
    log("Weekly summary was claimed by another run or switched off; not sending.");
    return;
  }
  // Re-read after the claim so a recipients change made moments ago is honored.
  const fresh = await getWeeklySummarySettings();
  if (fresh.recipients.length === 0) {
    log("Weekly summary recipients were removed; nothing sent.");
    return;
  }
  const report = await buildSummaryReport(fresh.daysAhead);
  const { subject, text } = renderWeeklyEmail(report);
  const result = await sendEmail({
    to: fresh.recipients,
    subject,
    text,
    html: renderEmailHtml(text),
  });
  if (!result.delivered) {
    log(
      `Weekly summary delivery failed (${result.error ?? "rejected"}); ` +
        "it won't retry until next week — the Send now button in Settings works any time.",
    );
    return;
  }
  log(`Weekly summary sent to ${fresh.recipients.length} recipient(s).`);
}

export async function runDailyAutomation(log: AutomationLog): Promise<void> {
  await runAutoLogistics(log);
  await runWeeklySummary(log);
}
