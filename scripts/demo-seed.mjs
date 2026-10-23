// Builds the public teacher demo (10-platform-onboarding, "Teacher demo"): a demo teacher account and a made-up
// center for it (scripts/demo-seed.sql). The /demo page signs visitors in as this teacher once the web app has
// DEMO_TEACHER_PHONE and DEMO_TEACHER_PASSWORD.
//
//   pnpm demo:seed                                   # local database
//   pnpm demo:seed --url "postgresql://postgres.xxxx:PASSWORD@aws-0-….pooler.supabase.com:5432/postgres"
//   pnpm demo:seed --phone +998990000077 --password demo-teacher --name "Demo Teacher"
//
// Run it again whenever the demo needs a clean start (visitors can mark attendance and enter scores): the old
// demo center is archived and a fresh one is built, and the teacher gets its password back and is signed out.
// It writes straight to Postgres as `postgres` (like dev:access), so it needs the database URL, not an API key.
//
// Both demo accounts carry app_metadata.demo = true, which visitors can't change. The SMS hook never sends a code
// to them, so nobody can reset the password or move the account to another phone. The center's owner account
// (--owner-phone) gets a random password nobody knows: it exists because every center keeps an active owner.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// postgres.js is a dependency of packages/db (pnpm doesn't hoist it to the root).
const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
const postgres = require("postgres");

const args = parseArgs(process.argv.slice(2));
const phone = (args.phone ?? "+998990000077").replace(/[\s()-]/g, "");
const ownerPhone = (args["owner-phone"] ?? "+998990000078").replace(/[\s()-]/g, "");
const name = (args.name ?? "Demo Teacher").trim();
const password = args.password ?? "uteach-demo";
const dbUrl =
  args.url ??
  process.env.UTEACH_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

for (const p of [phone, ownerPhone]) {
  if (!/^\+[1-9][0-9]{6,14}$/.test(p)) fail(`Phone must look like +998990000077, got "${p}".`);
  if (/^\+99899000000[0-9]$/.test(p))
    fail(
      "+998 99 000 00 0x are test numbers with the public code 123456; pick another demo phone.",
    );
}
if (phone === ownerPhone) fail("--phone and --owner-phone must differ.");
if (!name) fail("Name can't be empty.");
if (password.length < 8) fail("Password must be at least 8 characters.");

const host = new URL(dbUrl).hostname;
const seedSql = readFileSync(new URL("./demo-seed.sql", import.meta.url), "utf8");
const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });

console.log(`Building the teacher demo in ${host}…`);
try {
  await sql.begin(async (tx) => {
    const teacher = await demoAccount(tx, phone, name, password);
    const owner = await demoAccount(tx, ownerPhone, "Demo Owner", randomUUID());
    await tx`
      select set_config('demo.teacher', ${teacher}, true), set_config('demo.teacher_name', ${name}, true),
             set_config('demo.owner', ${owner}, true)`;
    await tx.unsafe(seedSql);
  });

  console.log(
    "Done: a fresh demo center with 4 groups, 27 students, past attendance and mock scores.",
  );
  console.log("");
  console.log(
    "Set these on the web app (Vercel → Settings → Environment Variables), then redeploy:",
  );
  console.log(`  DEMO_TEACHER_PHONE=${phone}`);
  console.log(`  DEMO_TEACHER_PASSWORD=${password}`);
  console.log("The demo opens at /en/demo (also /uz/demo and /ru/demo).");
} catch (e) {
  const err = /** @type {any} */ (e);
  if (err.code === "ECONNREFUSED") {
    fail(`Can't reach the database (${host}). Locally: is Docker running? Try \`pnpm db:start\`.`);
  }
  fail(err.message ?? String(err));
} finally {
  await sql.end({ timeout: 5 });
}

/**
 * Creates the account, or resets an existing demo account: password, pending phone change, signed-in sessions.
 * Refuses a phone that belongs to someone's real account.
 * @param {any} tx postgres.js transaction
 * @param {string} phone
 * @param {string} fullName
 * @param {string} pass
 * @returns {Promise<string>} the profile id
 */
async function demoAccount(tx, phone, fullName, pass) {
  const authPhone = phone.slice(1); // Supabase Auth stores phones without the "+"
  let [user] = await tx`select id, raw_app_meta_data from auth.users where phone = ${authPhone}`;
  if (user && user.raw_app_meta_data?.demo !== true) {
    throw new Error(`${phone} belongs to a real account. Pick a phone used only for the demo.`);
  }
  if (!user) {
    const id = randomUUID();
    await tx`
      insert into auth.users (
        instance_id, id, aud, role, phone, encrypted_password, phone_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated', ${authPhone},
        extensions.crypt(${pass}, extensions.gen_salt('bf')), now(),
        ${tx.json({ provider: "phone", providers: ["phone"], demo: true })},
        ${tx.json({ full_name: fullName, locale: "en" })}, now(), now(),
        '', '', '', ''
      )`;
    await tx`
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        ${id}, ${id},
        ${tx.json({ sub: id, phone: authPhone, phone_verified: true, email_verified: false })},
        'phone', now(), now(), now()
      )`;
    user = { id };
  } else {
    await tx`
      update auth.users
      set encrypted_password = extensions.crypt(${pass}, extensions.gen_salt('bf')),
          phone_confirmed_at = coalesce(phone_confirmed_at, now()),
          phone_change = '', phone_change_token = '',
          updated_at = now()
      where id = ${user.id}`;
    await tx`delete from auth.sessions where user_id = ${user.id}`;
  }

  // The on_auth_user_created trigger makes the profile; keep its name in step.
  const [profile] = await tx`
    update public.profiles set full_name = ${fullName}, locale = 'en' where id = ${user.id} returning id`;
  if (!profile)
    throw new Error("The account has no profile row (public.profiles). Did the migrations run?");
  return user.id;
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(url|phone|owner-phone|password|name)(?:=(.*))?$/.exec(argv[i] ?? "");
    if (!m)
      fail(`Unknown argument "${argv[i]}". Use --url, --phone, --owner-phone, --password, --name.`);
    const value = m[2] ?? argv[++i];
    if (value === undefined) fail(`--${m[1]} needs a value.`);
    out[m[1]] = value;
  }
  return out;
}

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`demo:seed: ${message}`);
  process.exit(1);
}
