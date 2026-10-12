// Local dev only. Gives one account an active owner membership in every center of the LOCAL database,
// so a single login can see every screen of every demo center (switch centers in the top bar).
//
//   pnpm dev:access                                   # +998 99 000 00 99 / uteach-owner
//   pnpm dev:access --phone +998901234567 --password my-pass --name "Nurulloxon"
//
// Creates the account if the phone has none (phone confirmed, no SMS needed). An existing account keeps its
// password unless --password is given. Safe to run again: it only adds what is missing. Run it again after
// `pnpm e2e` / `pnpm db:reset` (they wipe the local database) or after creating new centers.
//
// It writes straight to Postgres as `postgres`, like a seed file, so it refuses any host but localhost.
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

// postgres.js is a dependency of packages/db (pnpm doesn't hoist it to the root).
const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
const postgres = require("postgres");

const args = parseArgs(process.argv.slice(2));
const phone = (args.phone ?? "+998990000099").replace(/[\s()-]/g, "");
const name = (args.name ?? "Nurulloxon").trim();
const password = args.password ?? "uteach-owner";
const dbUrl =
  process.env.UTEACH_LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!/^\+[1-9][0-9]{6,14}$/.test(phone))
  fail(`Phone must look like +998990000099, got "${phone}".`);
if (!name) fail("Name can't be empty.");
if (password.length < 8) fail("Password must be at least 8 characters.");
const host = new URL(dbUrl).hostname;
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
  fail(`Refusing to touch a non-local database (${host}). This script is for local dev only.`);
}

const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
const authPhone = phone.slice(1); // Supabase Auth stores phones without the "+"

try {
  const result = await sql.begin(async (tx) => {
    let created = false;
    let passwordSet = false;
    let [user] = await tx`select id from auth.users where phone = ${authPhone}`;

    if (!user) {
      const id = randomUUID();
      await tx`
        insert into auth.users (
          instance_id, id, aud, role, phone, encrypted_password, phone_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change
        ) values (
          '00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated', ${authPhone},
          extensions.crypt(${password}, extensions.gen_salt('bf')), now(),
          ${tx.json({ provider: "phone", providers: ["phone"] })},
          ${tx.json({ full_name: name, locale: "en" })}, now(), now(),
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
      created = true;
      passwordSet = true;
    } else if (args.password) {
      await tx`
        update auth.users
        set encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')),
            phone_confirmed_at = coalesce(phone_confirmed_at, now()),
            updated_at = now()
        where id = ${user.id}`;
      passwordSet = true;
    }

    // The on_auth_user_created trigger makes the profile; make sure it exists anyway.
    const [profile] = await tx`select id from public.profiles where id = ${user.id}`;
    if (!profile) fail("The account has no profile row (public.profiles). Did the migrations run?");

    // Owner in every live center. Existing memberships (teacher, admin, disabled) become active owners.
    const rows = await tx`
      insert into public.memberships (center_id, profile_id, role, status, display_name)
      select c.id, ${user.id}, 'owner', 'active', ${name}
      from public.centers c
      where c.archived_at is null
      on conflict (center_id, profile_id) where profile_id is not null
      do update set role = 'owner', status = 'active'
      returning center_id`;

    const centers = await tx`
      select c.name, count(b.id)::int as branches
      from public.centers c
      left join public.branches b on b.center_id = c.id and b.archived_at is null
      where c.archived_at is null
      group by c.id, c.name
      order by c.created_at`;

    return { created, passwordSet, granted: rows.length, centers };
  });

  console.log(
    result.created ? `Created account ${phone} (${name}).` : `Using the existing account ${phone}.`,
  );
  if (result.centers.length === 0) {
    console.log(
      "No centers in the local database yet. Run `pnpm e2e` (demo data) or create a center, then run this again.",
    );
  } else {
    console.log(`Owner in ${result.centers.length} center(s):`);
    for (const c of result.centers) console.log(`  - ${c.name} (${c.branches} branch(es))`);
  }
  console.log("");
  console.log("Log in at http://localhost:3000/en/login");
  console.log(`  phone:    ${phone}`);
  console.log(
    `  password: ${result.passwordSet ? password : "(unchanged; pass --password to reset it)"}`,
  );
  console.log("Switch centers with the center menu in the top bar.");
} catch (e) {
  const err = /** @type {any} */ (e);
  if (err.code === "ECONNREFUSED") {
    fail(
      `Can't reach the local database (${host}:${new URL(dbUrl).port}). Is Docker running? Try \`pnpm db:start\`.`,
    );
  }
  fail(err.message ?? String(err));
} finally {
  await sql.end({ timeout: 5 });
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(phone|password|name)(?:=(.*))?$/.exec(argv[i] ?? "");
    if (!m) fail(`Unknown argument "${argv[i]}". Use --phone, --password, --name.`);
    const value = m[2] ?? argv[++i];
    if (value === undefined) fail(`--${m[1]} needs a value.`);
    out[m[1]] = value;
  }
  return out;
}

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`dev:access: ${message}`);
  process.exit(1);
}
