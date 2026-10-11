// Runs the Supabase migrations + pgTAP tests in PGlite (no Docker needed). Lower fidelity than
// `supabase test db`: auth is a minimal stand-in. CI runs the real thing. Usage: pnpm db:test:lite
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDatabase } from "./pglite.mjs";

const root = process.argv[2] ?? "supabase";
let db;
try {
  db = await createDatabase(root, { log: console.log });
} catch (e) {
  console.error(e.message);
  process.exit(1);
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
