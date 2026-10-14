/**
 * Routes reachable without signing in (paths without the locale prefix). "/" is the landing page for visitors
 * (M7e); signed-in people are sent on from it by the page itself.
 */
export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/verify",
  "/forgot-password",
  "/invite",
  "/terms",
  "/privacy",
];

/**
 * Developer pages reachable without signing in, only outside production (05-ui §7).
 * In production they're neither public nor rendered (the page itself calls notFound()).
 */
export const DEV_ONLY_PUBLIC_PATHS = ["/dev/ui"];

export function publicPathsFor(nodeEnv: string | undefined): string[] {
  return nodeEnv === "production" ? PUBLIC_PATHS : [...PUBLIC_PATHS, ...DEV_ONLY_PUBLIC_PATHS];
}

/** Signed-in users are sent away from these. */
export const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password"];

export function matchesPath(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Only same-site relative paths are allowed as `next` targets (no open redirects).
 * Returns null for anything else.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\r\n]/.test(value)) return null;
  return value;
}

/** Splits "/uz/staff" into { locale: "uz", path: "/staff" } for known locales. */
export function splitLocale(
  pathname: string,
  locales: readonly string[],
): { locale: string | null; path: string } {
  const [, first, ...rest] = pathname.split("/");
  if (first && locales.includes(first)) {
    return { locale: first, path: `/${rest.join("/")}`.replace(/\/$/, "") || "/" };
  }
  return { locale: null, path: pathname };
}
