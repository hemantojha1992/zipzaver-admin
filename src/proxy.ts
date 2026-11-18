import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/constants";

export function proxy(request: NextRequest) {
  if (!request.cookies.get(ADMIN_SESSION_COOKIE)?.value) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = { matcher: [
  "/dashboard/:path*", "/bookings/:path*", "/active-deliveries/:path*", "/incidents/:path*", "/alert-settings/:path*",
  "/customers/:path*", "/riders/:path*", "/kyc/:path*", "/agreements/:path*", "/settlements/:path*", "/adjustments/:path*",
  "/pricing/:path*", "/incentives/:path*", "/service-areas/:path*", "/disputes/:path*", "/admin-users/:path*",
  "/audit-log/:path*", "/settings/:path*",
] };
