import app from "./app";
import { ensureDatabaseUpgrades } from "./lib/db-upgrades";
import { logger } from "./lib/logger";
import { startAutomationScheduler } from "./lib/scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// The schema upgrade must finish before any request or scheduler run can
// touch the tables it patches — a production database that predates the
// Airtable sync column would otherwise fail every school query.
ensureDatabaseUpgrades()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      startAutomationScheduler();
    });
  })
  .catch((err) => {
    logger.error({ err }, "Database schema upgrade failed; not starting");
    process.exit(1);
  });
