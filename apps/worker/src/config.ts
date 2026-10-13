import { z } from "zod";

/**
 * Worker settings from the environment (01-tech-stack, M4 plan). The worker logs in to Postgres as
 * `uteach_worker` and never holds the service-role key.
 */
const schema = z.object({
  WORKER_DATABASE_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  /** For tests against a fake Bot API. */
  TELEGRAM_API_ROOT: z.url().optional(),
  SMS_PROVIDER: z.enum(["console", "eskiz"]).default("console"),
  ESKIZ_EMAIL: z.string().optional(),
  ESKIZ_PASSWORD: z.string().optional(),
  ESKIZ_FROM: z.string().optional(),
  ESKIZ_BASE_URL: z.url().optional(),
  SEND_INTERVAL_MS: z.coerce.number().int().min(250).default(5000),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
});

export type WorkerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const values = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`worker configuration is invalid: ${missing}`);
  }
  return parsed.data;
}
