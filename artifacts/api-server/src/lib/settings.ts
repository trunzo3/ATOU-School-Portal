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

export type LogisticsAutoSettings = {
  enabled: boolean;
  /** How many days before the workshop the logistics email goes out. */
  daysBefore: number;
  templateId: string;
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
  daysBefore: 60,
  templateId: "logistics-request",
};

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

export async function getLogisticsAutoSettings(): Promise<LogisticsAutoSettings> {
  const raw = await settingValue(LOGISTICS_KEY);
  if (!raw) return { ...DEFAULT_LOGISTICS };
  try {
    const parsed = JSON.parse(raw) as Partial<LogisticsAutoSettings>;
    return {
      enabled: parsed.enabled === true,
      daysBefore: clampInt(parsed.daysBefore, DEFAULT_LOGISTICS.daysBefore, 1, 365),
      templateId:
        typeof parsed.templateId === "string" && parsed.templateId
          ? parsed.templateId
          : DEFAULT_LOGISTICS.templateId,
    };
  } catch {
    return { ...DEFAULT_LOGISTICS };
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
