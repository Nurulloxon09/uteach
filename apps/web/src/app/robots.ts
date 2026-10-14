import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/**
 * Search engines may index only the public pages, and only where NEXT_PUBLIC_SITE_INDEXABLE=true (production,
 * M7d). Everywhere else (the Vercel preview, local) everything is blocked.
 */
export default function robots(): MetadataRoute.Robots {
  if (!publicEnv.NEXT_PUBLIC_SITE_INDEXABLE) return { rules: { userAgent: "*", disallow: "/" } };
  const pages = ["", "/terms", "/privacy"];
  return {
    rules: {
      userAgent: "*",
      allow: ["uz", "ru", "en"].flatMap((l) => pages.map((p) => `/${l}${p}$`)),
      disallow: "/",
    },
  };
}
