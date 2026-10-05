import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth check only (no database call): redirects signed-out visitors away from app
 * pages. Real authorisation happens in the server data-access layer on every request.
 */
const APP_PREFIXES = ["/dashboard", "/competitors", "/reviews", "/insights", "/compare", "/trends", "/reports", "/settings"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.svg|share).*)"],
};
