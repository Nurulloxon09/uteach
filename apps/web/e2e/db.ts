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
