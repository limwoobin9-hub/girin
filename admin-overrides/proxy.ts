import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_HEADERS, readAdminToken, safeReturnTo } from "@/lib/admin-session";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/login" || path === "/api/auth/login" || path === "/api/auth/logout") {
    return NextResponse.next({ headers: ADMIN_HEADERS });
  }
  const session = await readAdminToken(request.cookies.get(ADMIN_COOKIE)?.value);
  if (!session) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401, headers: ADMIN_HEADERS });
    const login = new URL("/login", request.url);
    login.host = request.headers.get("host") ?? login.host;
    const returnTo = safeReturnTo(`${path}${request.nextUrl.search}`);
    if (returnTo !== "/") login.searchParams.set("next", returnTo);
    return NextResponse.redirect(login);
  }
  return NextResponse.next({ headers: ADMIN_HEADERS });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.svg|file.svg|globe.svg|window.svg).*)"] };
