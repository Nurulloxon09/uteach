/**
 * uteach worker (01-tech-stack, 17): the grammY bot (long polling), the outbox sender every few seconds, stale
 * lock recovery and a heartbeat. It logs in to Postgres as `uteach_worker` (only `worker.*` functions).
 * Shutdown stops polling and claiming, lets the batch in flight finish (up to 10 s) and exits; anything left
 * `sending` is recovered as stale by the next start.
 */
import { createSmsProvider } from "@uteach/adapters";
import { createBot } from "./bot";
import { loadConfig } from "./config";
import { connect, workerDb } from "./db";
import { createSender } from "./sender";
import { RateLimiter, telegramSender } from "./telegram";

const config = loadConfig();
const sql = connect(config.WORKER_DATABASE_URL);
const db = workerDb(sql);
const sms = createSmsProvider(config.SMS_PROVIDER, config);
const bot = createBot(
  config.TELEGRAM_BOT_TOKEN,
  { db },
  {
    client: config.TELEGRAM_API_ROOT ? { apiRoot: config.TELEGRAM_API_ROOT } : {},
  },
);
const limiter = new RateLimiter();
const sender = createSender({ db, telegram: telegramSender(bot.api), sms, limiter });

const startedAt = new Date();
const totals = { sent: 0, failed: 0, retried: 0, skipped: 0 };
let running = true;
const timers: { beats?: ReturnType<typeof setInterval> } = {};
let inFlight: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendLoop() {
  while (running) {
    const round = sender.tick().then(
      (r) => {
        totals.sent += r.sent;
        totals.failed += r.failed;
        totals.retried += r.retried;
        totals.skipped += r.skipped;
        if (r.claimed > 0) console.info(`[sender] ${JSON.stringify(r)}`);
      },
      (e: unknown) => console.error(`[sender] round failed: ${String(e)}`),
    );
    inFlight = round;
    await round;
    if (running) await sleep(config.SEND_INTERVAL_MS);
  }
}

async function heartbeat() {
  try {
    const recovered = await db.recoverStale(120);
    if (recovered > 0) console.warn(`[worker] recovered ${recovered} stale row(s)`);
    await db.beat("worker", {
      startedAt: startedAt.toISOString(),
      sms: sms.name,
      ...totals,
    });
  } catch (e) {
    console.error(`[worker] heartbeat failed: ${String(e)}`);
  }
}

async function shutdown(signal: string) {
  if (!running) return;
  running = false;
  console.info(`[worker] ${signal} received, shutting down`);
  clearInterval(timers.beats);
  await Promise.race([Promise.all([bot.stop(), inFlight]), sleep(10_000)]);
  await sql.end({ timeout: 5 });
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await heartbeat();
timers.beats = setInterval(() => void heartbeat(), config.HEARTBEAT_INTERVAL_MS);
console.info(`[worker] started at ${startedAt.toISOString()} (sms: ${sms.name})`);
void sendLoop();
await bot.start({
  allowed_updates: ["message", "callback_query", "my_chat_member"],
  drop_pending_updates: false,
  onStart: (me) => console.info(`[bot] polling as @${me.username}`),
});
