import pino from "pino";
import cron from "node-cron";
import { loadConfig } from "./config.js";
import { Handler } from "./handler.js";
import { TransmissionClient } from "./client.js";

const config = loadConfig();

const logger = pino({
  level: config.logLevel,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",
      singleLine: false,
    },
  },
});

logger.info("═══════════════════════════════════════════════════════════");
logger.info("Transmission-DH Starting");
logger.info("───────────────────────────────────────────────────────────");
logger.info(`  URL: ${config.transmissionUrl.toString()}`);
logger.info(`  Labels: ${config.allowedLabels.join(", ") || "(none)"}`);
logger.info(`  Max Ratio: ${config.maxRatio}`);
logger.info(`  Max Age: ${config.maxAgeHours}h`);
logger.info(`  Dead Retention: ${config.deadRetentionHours}h`);
logger.info(`  Dry Run: ${config.dryRun ? "YES ⚠️" : "NO"}`);
logger.info(`  Schedule: ${config.schedule ?? "(one-shot)"}`);
logger.info("═══════════════════════════════════════════════════════════\n");

const client = new TransmissionClient(
  config.transmissionUrl.toString(),
  logger,
  config.transmissionAuth
);
const handler = new Handler(client, config, logger);

(async () => {
  try {
    // Run immediately on startup
    logger.info("→ Running cleanup check...");
    await handler.run();

    // If schedule is set, also run periodically
    if (config.schedule) {
      logger.info(`→ Scheduling periodic runs (${config.schedule})`);
      cron.schedule(config.schedule, async () => {
        logger.info("→ Scheduled run triggered");
        try {
          await handler.run();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`Scheduled run failed: ${message}`);
        }
      });
    } else {
      logger.info("✓ Done");
      process.exit(0);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Startup failed: ${message}`);
    process.exit(1);
  }
})();

