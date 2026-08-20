// Manual/scripted run of the daily automation:
//
//   pnpm --filter @workspace/api-server run daily
//
// The running API server already checks for due emails every 15 minutes
// (see lib/scheduler.ts); this script exists for manual runs and testing.
// Both paths share lib/automation.ts, and every send is claimed in the
// database before delivery, so overlapping runs never send anything twice.
import { runDailyAutomation } from "../lib/automation";
import { pacificToday } from "../lib/dates";

const log = (msg: string) => console.log(`[daily] ${msg}`);

async function main(): Promise<void> {
  log(`Run started, ${new Date().toISOString()} (Pacific date ${pacificToday()}).`);
  await runDailyAutomation(log);
  log("Run finished.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[daily] Run failed:", err);
    process.exit(1);
  });
