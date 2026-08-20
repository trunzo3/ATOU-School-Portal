// In-server scheduler for the daily automation and the Airtable sync.
// Replit can't run a separate scheduled job next to this web service, so the
// server checks every 15 minutes whether anything is due. That's safe
// because every send — and every sync pass — is claimed in the database
// first: running the checks many times a day (or on several server
// instances at once) can never send anything twice or sync the same pass
// twice.
import { runAirtableSyncNow } from "./airtable-sync";
import { runDailyAutomation } from "./automation";
import { logger } from "./logger";

const CHECK_EVERY_MS = 15 * 60 * 1000;
const FIRST_CHECK_AFTER_MS = 30 * 1000;
// Quiet log lines ("...is off; skipping") only get written once per boot so
// the server log stays readable.
let loggedQuietOnce = false;
let loggedAirtableQuietOnce = false;
let running = false;

async function check(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const lines: string[] = [];
    await runDailyAutomation((msg) => lines.push(msg));
    const interesting = lines.filter(
      (l) => !l.includes("; skipping.") && !l.includes("0 school(s)"),
    );
    if (interesting.length > 0) {
      for (const line of interesting) logger.info(`[automation] ${line}`);
    } else if (!loggedQuietOnce) {
      for (const line of lines) logger.info(`[automation] ${line}`);
      loggedQuietOnce = true;
    }
  } catch (err) {
    logger.error({ err }, "[automation] check failed");
  } finally {
    running = false;
  }
  try {
    const sync = await runAirtableSyncNow();
    if (sync.busy) {
      // another run (Sync now, or another instance) holds the claim
    } else if (!sync.ok && !sync.skipped) {
      logger.error(`[airtable] ${sync.message}`);
    } else if (sync.changed || !loggedAirtableQuietOnce) {
      logger.info(`[airtable] ${sync.message}`);
      loggedAirtableQuietOnce = true;
    }
  } catch (err) {
    logger.error({ err }, "[airtable] sync check failed");
  }
}

export function startAutomationScheduler(): void {
  logger.info("[automation] scheduler started; checking every 15 minutes.");
  setTimeout(() => void check(), FIRST_CHECK_AFTER_MS).unref();
  setInterval(() => void check(), CHECK_EVERY_MS).unref();
}
