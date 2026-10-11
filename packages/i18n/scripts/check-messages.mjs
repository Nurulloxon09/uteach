// Fails when uz/ru miss a key that en has (or have extras), or when a message is empty.
// en.json is the source catalog. Run: pnpm check:i18n
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");
const load = (locale) => JSON.parse(readFileSync(join(dir, `${locale}.json`), "utf8"));

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, out);
    else out.set(path, value);
  }
  return out;
}

// Placeholders like {name} must match between translations ({count, plural, ...} counts as "count").
const placeholders = (msg) =>
  [...String(msg).matchAll(/\{\s*([a-zA-Z0-9_]+)\s*(?:,|\})/g)]
    .map((m) => m[1])
    .sort()
    .join(",");

const source = flatten(load("en"));
let problems = 0;
const report = (line) => {
  problems++;
  console.error(line);
};

for (const [path, value] of source) {
  if (typeof value !== "string" || !value.trim()) report(`en: empty message at ${path}`);
}

for (const locale of ["uz", "ru"]) {
  const target = flatten(load(locale));
  for (const [path, value] of source) {
    if (!target.has(path)) report(`${locale}: missing ${path}`);
    else if (typeof target.get(path) !== "string" || !target.get(path).trim())
      report(`${locale}: empty message at ${path}`);
    else if (placeholders(target.get(path)) !== placeholders(value))
      report(`${locale}: placeholders differ at ${path}`);
  }
  for (const path of target.keys()) {
    if (!source.has(path)) report(`${locale}: extra key ${path} (not in en)`);
  }
}

if (problems) {
  console.error(`\n${problems} i18n problem(s).`);
  process.exit(1);
}
console.log(`i18n ok: ${source.size} messages in en, uz, ru.`);
