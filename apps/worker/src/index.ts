/**
 * uteach worker. M0 is only the skeleton: it starts, logs and shuts down cleanly.
 * The grammY bot, outbox sender and heartbeat arrive in M4 (docs/spec/17-telegram-notifications.md).
 */
import { defaultLocale } from "@uteach/i18n";

const startedAt = new Date();
console.info(`[worker] started at ${startedAt.toISOString()} (default locale ${defaultLocale})`);

// Keep the process alive until the bot and outbox loops exist.
const idle = setInterval(() => {}, 60_000);

function shutdown(signal: string) {
  console.info(`[worker] ${signal} received, shutting down`);
  clearInterval(idle);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
