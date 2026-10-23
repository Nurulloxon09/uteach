import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../../scripts/pglite.mjs";

/**
 * 10-platform-onboarding, "Teacher demo": scripts/demo-seed.sql builds a working center for the demo teacher,
 * with nothing that can reach a real person or charge money, and a second run starts over cleanly.
 * scripts/demo-seed.mjs makes the auth account first; here the stand-in `auth.users` row does that.
 */
const supabaseDir = fileURLToPath(new URL("../../../supabase", import.meta.url));
const seedSql = readFileSync(new URL("../../../scripts/demo-seed.sql", import.meta.url), "utf8");
let db: Awaited<ReturnType<typeof createDatabase>>;
let teacher: string;
let owner: string;

async function seed() {
  await db.transaction(async (tx) => {
    await tx.query(
      `select set_config('demo.teacher', $1, true), set_config('demo.teacher_name', 'Demo Teacher', true),
              set_config('demo.owner', $2, true)`,
      [teacher, owner],
    );
    await tx.exec(seedSql);
  });
}

async function one<T>(query: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(query, params)).rows[0]!;
}

/** Runs `fn` signed in as `uid` (RLS applies), then rolls back. */
async function asUser<T>(uid: string, fn: (q: typeof db.query) => Promise<T>): Promise<T> {
  let result: T;
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        `select set_config('role', 'authenticated', true),
                set_config('request.jwt.claims', json_build_object('sub', $1::uuid, 'role', 'authenticated')::text, true)`,
        [uid],
      );
      result = await fn(tx.query.bind(tx) as typeof db.query);
      throw new Error("rollback");
    });
  } catch (e) {
    if ((e as Error).message !== "rollback") throw e;
  }
  return result!;
}

beforeAll(async () => {
  db = await createDatabase(supabaseDir);
  const newUser = async (phone: string, name: string) =>
    (
      await one<{ id: string }>(
        `insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                 $1, now(), json_build_object('full_name', $2::text), now(), now())
         returning id::text`,
        [phone, name],
      )
    ).id;
  teacher = await newUser("998990000077", "Demo Teacher");
  owner = await newUser("998990000078", "Demo Owner");
  await seed();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("demo seed", () => {
  it("builds one live demo center with groups, students, lessons and scores", async () => {
    const counts = await one<Record<string, number>>(
      `select
         (select count(*)::int from public.centers where settings @> '{"demo": true}' and archived_at is null) as centers,
         (select count(*)::int from public.groups g join public.centers c on c.id = g.center_id
           where c.settings @> '{"demo": true}' and c.archived_at is null) as groups,
         (select count(*)::int from public.enrollments e join public.centers c on c.id = e.center_id
           where c.settings @> '{"demo": true}' and c.archived_at is null and e.status = 'active') as enrollments,
         (select count(*)::int from public.exam_results r join public.centers c on c.id = r.center_id
           where c.settings @> '{"demo": true}' and c.archived_at is null and r.total_score is not null) as scores,
         (select count(*)::int from public.student_targets t join public.centers c on c.id = t.center_id
           where c.settings @> '{"demo": true}' and c.archived_at is null) as targets`,
    );
    expect(counts).toEqual({ centers: 1, groups: 4, enrollments: 27, scores: 81, targets: 27 });
  });

  it("has held lessons with topics and attendance in the past, and lessons every day of the coming week", async () => {
    const past = await one<{ held: number; untitled: number; marks: number }>(
      `select count(*) filter (where l.status = 'held')::int as held,
              count(*) filter (where l.topic is null)::int as untitled,
              (select count(*)::int from public.attendance a where a.center_id = l.center_id) as marks
       from public.lessons l join public.centers c on c.id = l.center_id
       where c.settings @> '{"demo": true}' and c.archived_at is null
         and l.local_date < private.today_in('Asia/Tashkent')
       group by l.center_id`,
    );
    expect(past.held).toBeGreaterThan(40);
    expect(past.untitled).toBe(0);
    expect(past.marks).toBeGreaterThan(300);

    const week = await one<{ days: number }>(
      `select count(distinct l.local_date)::int as days
       from public.lessons l join public.centers c on c.id = l.center_id
       where c.settings @> '{"demo": true}' and c.archived_at is null
         and l.local_date between private.today_in('Asia/Tashkent') and private.today_in('Asia/Tashkent') + 6`,
    );
    expect(week.days).toBe(7);
  });

  it("queues no notifications and makes no charges", async () => {
    const counts = await one<{
      outbox: number;
      charges: number;
      guardians: number;
      phones: number;
    }>(
      `select
         (select count(*)::int from public.notification_outbox) as outbox,
         (select count(*)::int from public.charges) as charges,
         (select count(*)::int from public.guardians) as guardians,
         (select count(*)::int from public.students where phone is not null) as phones`,
    );
    expect(counts).toEqual({ outbox: 0, charges: 0, guardians: 0, phones: 0 });
  });

  it("lets the teacher see their groups and mark a lesson that is still open", async () => {
    const result = await asUser(teacher, async (q) => {
      const groups = (await q<{ n: number }>(`select count(*)::int as n from public.groups`))
        .rows[0]!.n;
      const [lesson] = (
        await q<{ id: string }>(
          `select l.id::text from public.lessons l
           where l.status = 'scheduled' and l.starts_at - interval '30 minutes' <= now()
             and l.ends_at + interval '48 hours' > now()
           order by l.starts_at limit 1`,
        )
      ).rows;
      const sheet = (
        await q<{ student_id: string }>(
          `select student_id::text from public.attendance_sheet($1)`,
          [lesson!.id],
        )
      ).rows;
      const saved = (
        await q<{ r: { saved: number; held: boolean } }>(
          `select public.save_attendance($1, $2::jsonb) as r`,
          [
            lesson!.id,
            JSON.stringify(sheet.map((s) => ({ studentId: s.student_id, status: "present" }))),
          ],
        )
      ).rows[0]!.r;
      return { groups, sheet: sheet.length, saved };
    });
    expect(result.groups).toBe(4);
    expect(result.sheet).toBeGreaterThan(5);
    expect(result.saved).toEqual({ saved: result.sheet, alerts: 0, held: true });
  });

  it("starts over on a second run: the old center is archived and the teacher keeps one membership", async () => {
    await seed();
    const state = await one<{ live: number; archived: number; active: number; disabled: number }>(
      `select
         (select count(*)::int from public.centers where settings @> '{"demo": true}' and archived_at is null) as live,
         (select count(*)::int from public.centers where settings @> '{"demo": true}' and archived_at is not null
            and status = 'cancelled') as archived,
         (select count(*)::int from public.memberships where profile_id = $1 and status = 'active') as active,
         (select count(*)::int from public.memberships where profile_id = $1 and status = 'disabled') as disabled`,
      [teacher],
    );
    expect(state).toEqual({ live: 1, archived: 1, active: 1, disabled: 1 });
  });
});
