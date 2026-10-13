import postgres from "postgres";

/**
 * Test-only database access (30-milestones M3 plan): jobs that pg_cron runs in production are called directly,
 * so a test doesn't wait for the clock. `pnpm e2e` resets the local database first, so nothing here leaks into
 * the next run. Default URL = the local Supabase stack (also what CI starts).
 */
const URL = process.env.UTEACH_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(URL, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Stops the hourly cron run of `generate_cycle_charges`, so only the test decides when it runs. */
export function pauseCycleCron(): Promise<void> {
  return withDb(async (sql) => {
    await sql`
      do $$ begin
        if exists (select 1 from pg_namespace where nspname = 'cron') then
          perform cron.unschedule(jobid) from cron.job where jobname = 'generate_cycle_charges';
        end if;
      end $$`;
  });
}

/** Puts the hourly schedule back (as the M3 migration sets it up). */
export function resumeCycleCron(): Promise<void> {
  return withDb(async (sql) => {
    await sql`
      do $$ begin
        if exists (select 1 from pg_namespace where nspname = 'cron') then
          perform cron.schedule('generate_cycle_charges', '30 * * * *',
            'select private.generate_cycle_charges()');
        end if;
      end $$`;
  });
}

/** One run of the hourly job that creates the next cycle's charges. */
export function runCycleJob(): Promise<void> {
  return withDb(async (sql) => {
    await sql`select private.generate_cycle_charges()`;
  });
}

/** Lesson ids of a group (by center and group name), oldest first. */
export function lessonIds(center: string, group: string): Promise<string[]> {
  return withDb(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      select l.id from public.lessons l
      join public.groups g on g.id = l.group_id
      join public.centers c on c.id = g.center_id
      where c.name = ${center} and g.name = ${group}
      order by l.starts_at`;
    return rows.map((r) => r.id);
  });
}

/**
 * M4 notifications: a second branch and four students in a center: in the first branch an owing student with a
 * guardian and one who owes nothing, in the second an owing student; debts are opening balances.
 */
export function seedNotifyCenter(
  center: string,
  branches: { first: string; second: string },
): Promise<void> {
  return withDb(async (sql) => {
    const [{ id: centerId }] = (await sql`
      select id from public.centers where name = ${center}`) as unknown as [{ id: string }];
    await sql`
      insert into public.branches (center_id, name, timezone)
      values (${centerId}, ${branches.second}, 'Asia/Tashkent')`;
    const [{ b1, b2 }] = (await sql`
      select (select id from public.branches where center_id = ${centerId} and name = ${branches.first}) as b1,
             (select id from public.branches where center_id = ${centerId} and name = ${branches.second}) as b2
    `) as unknown as [{ b1: string; b2: string }];
    const students = await sql<{ id: string; full_name: string }[]>`
      insert into public.students (center_id, branch_id, full_name, phone)
      values (${centerId}, ${b1}, 'Aziz Debtor', '+998931230001'),
             (${centerId}, ${b1}, 'Bahrom Paid', '+998931230002'),
             (${centerId}, ${b2}, 'Charos Debtor', '+998931230003')
      returning id, full_name`;
    const id = (name: string) => students.find((s) => s.full_name === name)!.id;
    const [{ id: guardian }] = (await sql`
      insert into public.guardians (center_id, full_name, phone)
      values (${centerId}, 'Aziza Mother', '+998931239001') returning id`) as unknown as [
      { id: string },
    ];
    await sql`
      insert into public.student_guardians (center_id, student_id, guardian_id, is_primary)
      values (${centerId}, ${id("Aziz Debtor")}, ${guardian}, true)`;
    await sql`
      insert into public.balance_adjustments (center_id, student_id, kind, amount, details)
      values (${centerId}, ${id("Aziz Debtor")}, 'opening_balance', -50000000, '{}'),
             (${centerId}, ${id("Charos Debtor")}, 'opening_balance', -30000000, '{}')`;
  });
}

/** Who a center's broadcasts went to: guardian or student names, sorted. */
export function broadcastRecipients(center: string): Promise<string[]> {
  return withDb(async (sql) => {
    const rows = await sql<{ name: string }[]>`
      select coalesce(g.full_name, s.full_name) as name
      from public.notification_outbox o
      join public.centers c on c.id = o.center_id
      left join public.guardians g on g.id = o.guardian_id
      left join public.students s on s.id = o.student_id
      where c.name = ${center} and o.broadcast_id is not null
      order by 1`;
    return rows.map((r) => r.name);
  });
}

/**
 * M5 leads: an extra lesson of a group starting `minutes` from now (60 minutes long, the group's teacher), so a
 * trial can be booked on it (still upcoming) and then marked (the sheet opens 30 minutes before the start).
 */
export function addLessonSoon(center: string, group: string, minutes: number): Promise<string> {
  return withDb(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into public.lessons (center_id, branch_id, group_id, local_date, starts_at, ends_at,
                                  teacher_membership_id, status, is_manually_edited)
      select g.center_id, g.branch_id, g.id,
             ((now() + make_interval(mins => ${minutes})) at time zone b.timezone)::date,
             now() + make_interval(mins => ${minutes}),
             now() + make_interval(mins => ${minutes + 60}),
             g.teacher_membership_id, 'scheduled', true
      from public.groups g
      join public.centers c on c.id = g.center_id
      join public.branches b on b.id = g.branch_id
      where c.name = ${center} and g.name = ${group}
      returning id`;
    return row!.id;
  });
}
