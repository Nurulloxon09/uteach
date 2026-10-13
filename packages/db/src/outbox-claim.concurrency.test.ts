import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * 30-milestones M4: two worker instances never claim the same outbox row (FOR UPDATE SKIP LOCKED in
 * `worker.claim_outbox`). Needs real Postgres connections, so it runs only with UTEACH_DB_URL (setup, as postgres)
 * and UTEACH_WORKER_DB_URL (the workers, logged in as `uteach_worker` with the local password from
 * `supabase/seed.sql`) set: CI's database job, or locally
 * `UTEACH_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
 *  UTEACH_WORKER_DB_URL=postgresql://uteach_worker:uteach-worker-local@127.0.0.1:54322/postgres
 *  pnpm --filter @uteach/db test`. Rows of other centers claimed along the way are put back as they were.
 */
const url = process.env.UTEACH_DB_URL;
const workerUrl = process.env.UTEACH_WORKER_DB_URL;
const sql = url && workerUrl ? postgres(url, { max: 2, onnotice: () => {} }) : null;
const workers = url && workerUrl ? postgres(workerUrl, { max: 4, onnotice: () => {} }) : null;

afterAll(async () => {
  await sql?.end();
  await workers?.end();
});

type Job = { id: string; center_id: string };

describe.skipIf(!sql)("outbox claims under concurrency", () => {
  it("two workers claiming in parallel get disjoint rows and together every row", async () => {
    const db = sql!;
    const run = Date.now().toString().slice(-7);

    // A center with one student, as its owner (create_center runs as in the app).
    const [user] = await db<{ id: string }[]>`
      insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_user_meta_data,
                              created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              ${`99896${run}`}, now(), ${db.json({ full_name: "Outbox Owner" })}, now(), now())
      returning id`;
    const claims = JSON.stringify({ sub: user!.id, role: "authenticated" });
    const center = await db.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}, true)`;
      const [row] = await tx<{ id: string }[]>`
        select public.create_center(${`Outbox ${run}`}, 'Asia/Tashkent', 'uz', 'Main') as id`;
      return row!.id;
    });
    const [student] = await db<{ id: string }[]>`
      insert into public.students (center_id, branch_id, full_name)
      select ${center}, b.id, 'Outbox Student' from public.branches b where b.center_id = ${center}
      returning id`;
    const total = 60;
    await db`
      insert into public.notification_outbox (center_id, template_key, locale, payload, student_id, dedupe_key)
      select ${center}, 'broadcast', 'uz', '{"center": "Outbox", "body": "x"}', ${student!.id}, 'claim-test:' || n
      from generate_series(1, ${total}) n`;

    // Each worker claims 7 at a time and holds its transaction briefly, like a sender would.
    const worker = async () => {
      const mine: Job[] = [];
      for (;;) {
        const batch = await workers!.begin(async (tx) => {
          const jobs = await tx<Job[]>`select id, center_id from worker.claim_outbox(7)`;
          await tx`select pg_sleep(0.02)`;
          return jobs;
        });
        if (batch.length === 0) return mine;
        mine.push(...batch);
      }
    };
    const [a, b] = await Promise.all([worker(), worker()]);

    // The worker's login can't read tables directly.
    await expect(workers!`select count(*) from public.notification_outbox`).rejects.toThrow(
      /permission denied/,
    );
    const all = [...a, ...b];

    const others = all.filter((j) => j.center_id !== center).map((j) => j.id);
    if (others.length > 0) {
      await db`
        update public.notification_outbox
        set status = 'pending', attempts = greatest(attempts - 1, 0), locked_at = null
        where id = any(${others}::uuid[]) and status = 'sending'`;
    }

    const ours = all.filter((j) => j.center_id === center).map((j) => j.id);
    expect(new Set(ours).size).toBe(ours.length);
    expect(ours).toHaveLength(total);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    const [state] = await db<{ sending: number; attempts: number }[]>`
      select count(*) filter (where status = 'sending')::int as sending, max(attempts)::int as attempts
      from public.notification_outbox where center_id = ${center}`;
    expect(state).toEqual({ sending: total, attempts: 1 });
  }, 60_000);
});
