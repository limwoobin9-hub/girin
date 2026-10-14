import { NextRequest, NextResponse } from "next/server";
import { sameAdminOrigin, setAdminCookie } from "@/lib/admin-auth";
import { ADMIN_HEADERS } from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameAdminOrigin(request)) return NextResponse.json({ error: "요청 출처를 확인할 수 없습니다." }, { status: 403, headers: ADMIN_HEADERS });
  const login = new URL("/login", request.url);
  login.host = request.headers.get("host") ?? login.host;
  const response = NextResponse.redirect(login, 303);
  Object.entries(ADMIN_HEADERS).forEach(([key, value]) => response.headers.set(key, value));
  response.headers.set("Clear-Site-Data", '"cache"');
  response.cookies.set("girin_student_session", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return setAdminCookie(response, "", true);
}
