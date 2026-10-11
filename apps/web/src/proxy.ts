import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { GUEST_ONLY_PATHS, matchesPath, publicPathsFor, splitLocale } from "@/lib/paths";
import { refreshSession } from "@/lib/supabase/proxy";

const intl = createIntlMiddleware(routing);
const publicPaths = publicPathsFor(process.env.NODE_ENV);

/**
 * 1. next-intl picks/redirects the locale.
 * 2. The Supabase session cookie is refreshed.
 * 3. Optimistic auth redirect. Pages still check the user themselves; RLS is the real guard.
 */
export default async function proxy(request: NextRequest) {
  const response = intl(request);
  const { signedIn } = await refreshSession(request, response);

  const { locale, path } = splitLocale(request.nextUrl.pathname, routing.locales);
  if (!locale) return response; // next-intl is redirecting to a localized URL

  if (!signedIn && !matchesPath(path, publicPaths)) {
    const url = new URL(`/${locale}/login`, request.url);
    if (path !== "/") url.searchParams.set("next", `/${locale}${path}${request.nextUrl.search}`);
    return withCookies(NextResponse.redirect(url), response);
  }

  if (signedIn && matchesPath(path, GUEST_ONLY_PATHS)) {
    return withCookies(NextResponse.redirect(new URL(`/${locale}`, request.url)), response);
  }

  return response;
}

/** Keep refreshed session cookies when we replace the response with a redirect. */
function withCookies(target: NextResponse, source: NextResponse) {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
