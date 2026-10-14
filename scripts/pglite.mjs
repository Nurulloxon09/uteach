// PGlite (Postgres in WebAssembly) with a small stand-in for Supabase's `auth` schema and roles, and
// every migration applied. Used by `pnpm db:test:lite` and by the SQL parity tests in packages/db.
// Lower fidelity than `supabase test db`, which CI runs too.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pgtap } from "@electric-sql/pglite-pgtap";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
  last_sign_in_at timestamptz,
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

/**
 * A fresh database with all migrations from `<supabaseDir>/migrations`.
 * @param {string} supabaseDir path to the `supabase` folder
 * @param {{ log?: (line: string) => void }} [options]
 * @returns {Promise<PGlite>}
 */
export async function createDatabase(supabaseDir, options = {}) {
  const log = options.log ?? (() => {});
  const db = new PGlite({ extensions: { pgcrypto, citext, btree_gist, pgtap } });
  await db.exec(bootstrap);
  await db.exec(`set search_path to "$user", public, extensions`);

  const migrations = readdirSync(join(supabaseDir, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of migrations) {
    try {
      await db.exec(readFileSync(join(supabaseDir, "migrations", f), "utf8"));
      log(`migration ok: ${f}`);
    } catch (e) {
      const err = /** @type {any} */ (e);
      throw new Error(
        `migration FAILED: ${f}\n${err.message}\n${err.detail ?? ""} ${err.hint ?? ""} ${err.where ?? ""}`,
      );
    }
  }
  return db;
}
