"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * List state lives in the URL (?q, filters, page, size) so the server filters and the page is shareable.
 * Changing anything but the page resets to page 1.
 */
export function useListParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const hrefWith = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in changes)) next.delete("page");
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      startTransition(() => router.replace(hrefWith(changes), { scroll: false }));
    },
    [router, hrefWith],
  );

  return { searchParams, hrefWith, setParams, pending };
}
