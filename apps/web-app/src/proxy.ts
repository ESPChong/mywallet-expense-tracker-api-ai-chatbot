import { NextRequest, NextResponse } from 'next/server';

// Cheap first gate only: does a session cookie EXIST?
// Real validation (is it valid?) happens in (app)/layout.tsx via getCurrentUser().
const PUBLIC_PATHS = ['/login', '/register', '/about'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // NOTE: Do NOT redirect /login → / when a cookie exists
  // A stale-but-present cookie + that rule + the layout's /login redirect
  // would create an infinite redirect loop. The (auth) layout does that
  // job safely using a real session check instead.
  if (!PUBLIC_PATHS.includes(pathname) && !request.cookies.has('session_token')) {
    const url = new URL('/login', request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Pages only — API routes return their own 401s and must never be redirected
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
