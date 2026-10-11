// Runs the Supabase migrations + pgTAP tests in PGlite (no Docker needed). Lower fidelity than
// `supabase test db`: auth is a minimal stand-in. CI runs the real thing. Usage: pnpm db:test:lite
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgtap } from "@electric-sql/pglite-pgtap";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "supabase";
const db = new PGlite({ extensions: { pgcrypto, citext, pgtap } });

const bootstrap = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema auth;
create table auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text,
  phone text unique,
  phone_confirmed_at timestamptz,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

await db.exec(bootstrap);
await db.exec(`set search_path to "$user", public, extensions`);

const migrations = readdirSync(join(root, "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const f of migrations) {
  try {
    await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
    console.log(`migration ok: ${f}`);
  } catch (e) {
    console.error(
      `migration FAILED: ${f}\n${e.message}\n${e.detail ?? ""} ${e.hint ?? ""} ${e.where ?? ""}`,
    );
    process.exit(1);
  }
}

const testsDir = join(root, "tests", "database");
let failed = 0;
for (const f of readdirSync(testsDir)
  .filter((x) => x.endsWith(".sql"))
  .sort()) {
  console.log(`# ${f}`);
  try {
    const results = await db.exec(readFileSync(join(testsDir, f), "utf8"));
    for (const r of results) {
      for (const row of r.rows) {
        for (const v of Object.values(row)) {
          if (typeof v !== "string") continue;
          for (const line of v.split("\n")) {
            if (/^(not ok|ok|#|1\.\.)/.test(line)) console.log(line);
            if (line.startsWith("not ok")) failed++;
          }
        }
      }
    }
  } catch (e) {
    failed++;
    console.error(`test file errored: ${e.message}\n${e.where ?? ""}`);
  }
}
console.log(failed ? `\nFAILED: ${failed}` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
