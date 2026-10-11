/** Server-safe helpers for list pages (no "use client": server pages import these as plain values). */

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads `q`, `page`, `size` and the given filter params from a page's searchParams. */
export function parseListParams<F extends string>(raw: RawParams, filters: readonly F[] = []) {
  const q = (first(raw.q) ?? "").trim().slice(0, 100);
  const pageNum = Number.parseInt(first(raw.page) ?? "1", 10);
  const sizeNum = Number.parseInt(first(raw.size) ?? "", 10);
  const size = (PAGE_SIZES as readonly number[]).includes(sizeNum) ? sizeNum : DEFAULT_PAGE_SIZE;
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const values = {} as Record<F, string | undefined>;
  for (const f of filters) values[f] = first(raw[f]) || undefined;
  return { q, page, size, filters: values, from: (page - 1) * size, to: page * size - 1 };
}

export function pageCountFor(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Pages to show: all when few, else a window around the current page plus the last page. */
export function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const start = Math.max(1, Math.min(page - 2, pageCount - 5));
  const window = Array.from({ length: 5 }, (_, i) => start + i).filter((p) => p < pageCount);
  const last = window[window.length - 1] ?? 1;
  return [...window, ...(last < pageCount - 1 ? (["gap"] as const) : []), pageCount];
}
