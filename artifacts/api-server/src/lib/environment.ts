/**
 * Server-side environment identity — the one place that decides whether
 * this server instance is development or production (same rule that gates
 * the temporary dev-login route).
 *
 * Airtable sync is production-only by default: the dev workspace and the
 * deployment share one Airtable base, so a dev server that syncs would push
 * dev edits into Airtable and production would pull them right back
 * (cross-contamination both ways). Setting AIRTABLE_SYNC_DEV_OVERRIDE=true
 * in development deliberately re-enables sync for testing.
 */

export type EnvironmentName = "development" | "production";

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

export function environmentName(): EnvironmentName {
  return isProductionEnvironment() ? "production" : "development";
}

/** Explicit dev-only opt-in for testing sync from the dev workspace. */
export function airtableDevOverrideActive(): boolean {
  return !isProductionEnvironment() && process.env["AIRTABLE_SYNC_DEV_OVERRIDE"] === "true";
}

/**
 * The single gate every Airtable touchpoint goes through: scheduled sync,
 * live portal-save write-backs, the manual "Sync now" endpoint, and the
 * admin status check. True in production; false in development unless the
 * override env var is set.
 */
export function airtableSyncAllowed(): boolean {
  return isProductionEnvironment() || airtableDevOverrideActive();
}
