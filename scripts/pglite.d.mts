import type { PGlite } from "@electric-sql/pglite";

export function createDatabase(
  supabaseDir: string,
  options?: { log?: (line: string) => void },
): Promise<PGlite>;
