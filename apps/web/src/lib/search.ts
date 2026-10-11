/**
 * Turns a user's search text into a PostgREST `ilike` pattern. Characters that have a meaning in
 * PostgREST filter syntax (`,()`), LIKE wildcards and backslashes are replaced with spaces.
 */
export function ilikePattern(q: string): string | null {
  const cleaned = q
    .replace(/[,()*%_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? `%${cleaned}%` : null;
}
