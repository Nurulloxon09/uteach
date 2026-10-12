import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * 30-milestones M3: receipt numbers are unique and gap-free per branch per year under 20 concurrent payments.
 * Needs real Postgres connections (PGlite has one), so it runs only with UTEACH_DB_URL set: CI's database job
 * and `UTEACH_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter @uteach/db test`.
 * Payments are permanent, so each run adds a small test center to that database.
 */
const url = process.env.UTEACH_DB_URL;
const sql = url ? postgres(url, { max: 25, onnotice: () => {} }) : null;

afterAll(async () => {
  await sql?.end();
});

describe.skipIf(!sql)("receipt numbers under concurrency", () => {
  it("20 concurrent payments (5 rolled back) get unique, gap-free numbers", async () => {
    const db = sql!;
    const run = Date.now().toString().slice(-7);
    const phone = `+99897${run}`;

    // An owner with a center, a branch and a student (as the owner, so create_center runs as in the app).
    const [user] = await db<{ id: string }[]>`
      insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_user_meta_data,
                              created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              ${phone.slice(1)}, now(), ${db.json({ full_name: "Concurrency Owner" })}, now(), now())
      returning id`;
    const claims = JSON.stringify({ sub: user!.id, role: "authenticated" });
    const asOwner = async <T>(work: (tx: postgres.TransactionSql) => Promise<T>) =>
      db.begin(async (tx) => {
        await tx`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}, true)`;
        return work(tx);
      });

    const center = await asOwner(
      async (tx) =>
        (
          await tx<{ id: string }[]>`
          select public.create_center(${`Concurrency ${run}`}, 'Asia/Tashkent', 'uz', 'Main') as id`
        )[0]!.id,
    );
    const [student] = await db<{ id: string; code: string }[]>`
      insert into public.students (center_id, branch_id, full_name)
      select ${center}, b.id, 'Concurrent Payer' from public.branches b where b.center_id = ${center}
      returning id, (select code from public.branches where center_id = ${center}) as code`;

    // 20 payments at once; every 4th one fails after taking its number and rolls back.
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        asOwner(async (tx) => {
          const [row] = await tx<{ r: { receiptNo: string } }[]>`
            select public.record_payment(${student!.id}, ${100000 + i}, 'cash') as r`;
          if (i % 4 === 3) throw new Error("rollback");
          return row!.r.receiptNo;
        }),
      ),
    );
    const committed = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    expect(committed).toHaveLength(15);

    const stored = await db<{ receipt_no: string }[]>`
      select receipt_no from public.payments where center_id = ${center} order by receipt_no`;
    const year = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
    }).format(new Date());
    expect(stored.map((p) => p.receipt_no)).toEqual(
      Array.from(
        { length: 15 },
        (_, i) => `${student!.code}-${year}-${String(i + 1).padStart(6, "0")}`,
      ),
    );
    expect([...committed].sort()).toEqual(stored.map((p) => p.receipt_no));
  }, 60_000);
});
