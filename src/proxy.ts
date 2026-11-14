import { NextResponse, type NextRequest } from "next/server";

import { VISITOR_COOKIE } from "@/lib/visitor";

// Gives every visitor a stable, anonymous id, so the funnel can follow one
// browser from the form to a status change without knowing who they are.
export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.has(VISITOR_COOKIE)) {
    response.cookies.set(VISITOR_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}

export const config = {
  // Skip the API, Next's own assets and the favicon.
  matcher: ["/((?!api|_next|favicon.ico).*)"],
};
