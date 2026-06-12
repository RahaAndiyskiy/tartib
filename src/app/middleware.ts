import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Placeholder for auth and routing middleware logic.
  if (pathname.startsWith('/dashboard')) {
    // Example: check session or redirect to /login when not authenticated.
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*']
};
