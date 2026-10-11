/**
 * Name comparison for duplicate warnings and import matching (12, 10). Mirrors `private.normalize_name`
 * in SQL: trimmed, lower-case, single spaces, and every apostrophe style (ʻ ʼ ‘ ’ `) as '.
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/[ʻʼ‘’`]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
