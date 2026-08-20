import { eq, sql } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";

export const EMAIL_SENDING_ENABLED_KEY = "email_sending_enabled";

export async function settingValue(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return row ? row.value : null;
}

export async function saveSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

/** The switch that gates all school-facing mailings (not internal ones). */
export async function emailSendingEnabled(): Promise<boolean> {
  return (await settingValue(EMAIL_SENDING_ENABLED_KEY)) === "true";
}

// --- automatic email settings ---
// Both blocks default to OFF so a fresh production database comes up
// switched off. Stored as JSON under one app_settings key each.

export type LogisticsRule = {
  templateId: string;
  /** How many days before the workshop this template goes out. */
  daysBefore: number;
};

export type LogisticsAutoSettings = {
  /** One switch for the whole block; forced off while no rules exist. */
  enabled: boolean;
  /** Up to two rules; each template can be used by at most one rule. */
  rules: LogisticsRule[];
};

export type WeeklySummarySettings = {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday, in Pacific time. */
  dayOfWeek: number;
  /** How many days ahead the summary window looks. */
  daysAhead: number;
  recipients: string[];
  /** ISO timestamp of the last summary email, null if never sent. */
  lastSentAt: string | null;
};

const LOGISTICS_KEY = "auto_logistics";
const WEEKLY_KEY = "weekly_summary";

export const DEFAULT_LOGISTICS: LogisticsAutoSettings = {
  enabled: false,
  rules: [],
};

export const MAX_LOGISTICS_RULES = 2;

// The template ids live here (not templates.ts) so settings helpers can use
// them without a circular import; templates.ts re-exports them.
export const REQUEST_TEMPLATE_ID = "logistics-request";
export const FOLLOW_UP_TEMPLATE_ID = "logistics-follow-up";

/**
 * A plain-language problem with a rule combination, or null when it's fine.
 * The follow-up must land closer to the workshop than the request: if it
 * came first (or the same day) it would either never fire — no prior email
 * to follow up on yet — or double-email a school on the shared day. A
 * follow-up-only setup is allowed on purpose: it still covers schools Pam
 * emailed by hand.
 */
export function logisticsRulesProblem(rules: LogisticsRule[]): string | null {
  const request = rules.find((r) => r.templateId === REQUEST_TEMPLATE_ID);
  const followUp = rules.find((r) => r.templateId === FOLLOW_UP_TEMPLATE_ID);
  if (request && followUp && followUp.daysBefore >= request.daysBefore) {
    return "The follow-up has to go out closer to the workshop than the request — give it a smaller number of days.";
  }
  return null;
}

export const DEFAULT_WEEKLY: WeeklySummarySettings = {
  enabled: false,
  dayOfWeek: 1, // Monday
  daysAhead: 30,
  recipients: [],
  lastSentAt: null,
};

const clampInt = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeRecipients(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const email = String(raw).trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/**
 * Clean up a list of rules from a form or the database: drop entries without
 * a template, drop repeats of the same template, drop out-of-range send days,
 * and cap the list at two rules.
 */
export function normalizeLogisticsRules(list: unknown): LogisticsRule[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: LogisticsRule[] = [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const templateId = typeof entry.templateId === "string" ? entry.templateId.trim() : "";
    if (!templateId || seen.has(templateId)) continue;
    const daysBefore = clampInt(entry.daysBefore, 0, 1, 365);
    if (daysBefore === 0) continue;
    seen.add(templateId);
    out.push({ templateId, daysBefore });
    if (out.length === MAX_LOGISTICS_RULES) break;
  }
  return out;
}

export async function getLogisticsAutoSettings(): Promise<LogisticsAutoSettings> {
  const raw = await settingValue(LOGISTICS_KEY);
  if (!raw) return { ...DEFAULT_LOGISTICS, rules: [] };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Settings saved before rules existed stored one template and one send
    // day at the top level; they carry over as a single equivalent rule.
    const rules = Array.isArray(parsed.rules)
      ? normalizeLogisticsRules(parsed.rules)
      : normalizeLogisticsRules([
          { templateId: parsed.templateId, daysBefore: parsed.daysBefore },
        ]);
    return { enabled: parsed.enabled === true && rules.length > 0, rules };
  } catch {
    return { ...DEFAULT_LOGISTICS, rules: [] };
  }
}

export async function saveLogisticsAutoSettings(s: LogisticsAutoSettings): Promise<void> {
  await saveSetting(LOGISTICS_KEY, JSON.stringify(s));
}

export async function getWeeklySummarySettings(): Promise<WeeklySummarySettings> {
  const raw = await settingValue(WEEKLY_KEY);
  if (!raw) return { ...DEFAULT_WEEKLY };
  try {
    const parsed = JSON.parse(raw) as Partial<WeeklySummarySettings>;
    return {
      enabled: parsed.enabled === true,
      dayOfWeek: clampInt(parsed.dayOfWeek, DEFAULT_WEEKLY.dayOfWeek, 0, 6),
      daysAhead: clampInt(parsed.daysAhead, DEFAULT_WEEKLY.daysAhead, 1, 365),
      recipients: normalizeRecipients(parsed.recipients),
      lastSentAt: typeof parsed.lastSentAt === "string" ? parsed.lastSentAt : null,
    };
  } catch {
    return { ...DEFAULT_WEEKLY };
  }
}

export async function saveWeeklySummarySettings(s: WeeklySummarySettings): Promise<void> {
  await saveSetting(WEEKLY_KEY, JSON.stringify(s));
}

/**
 * Save weekly settings from a form submit. On update, the lastSentAt already
 * in the database wins over the one passed in, so saving the form can never
 * erase a send timestamp the daily job wrote in the meantime.
 */
export async function saveWeeklySummarySettingsKeepingLastSent(
  s: WeeklySummarySettings,
): Promise<void> {
  await db.execute(sql`
    insert into app_settings (key, value)
    values (${WEEKLY_KEY}, ${JSON.stringify(s)})
    on conflict (key) do update set
      value = (
        excluded.value::jsonb
        || jsonb_build_object(
             'lastSentAt',
             coalesce(app_settings.value::jsonb->'lastSentAt', 'null'::jsonb)
           )
      )::text,
      updated_at = now()
  `);
}

/**
 * Atomically claim a weekly summary send by writing lastSentAt, but only if
 * the stored value still matches what this run read earlier. Overlapping
 * runs (daily job and Send now included) all try; the database lets exactly
 * one through, so the summary can never go out twice. When requireEnabled is
 * true (the daily job), the claim also fails if the switch was turned off
 * after this run read its settings.
 */
export async function claimWeeklySend(
  previousLastSentAt: string | null,
  nowIso: string,
  opts: { requireEnabled?: boolean } = {},
): Promise<boolean> {
  const requireEnabled = opts.requireEnabled === true;
  const result = await db.execute(sql`
    update app_settings
    set value = jsonb_set(value::jsonb, '{lastSentAt}', to_jsonb(${nowIso}::text))::text,
        updated_at = now()
    where key = ${WEEKLY_KEY}
      and value::jsonb->>'lastSentAt' is not distinct from ${previousLastSentAt}
      and (${requireEnabled} = false or value::jsonb->>'enabled' = 'true')
  `);
  return (result.rowCount ?? 0) > 0;
}
