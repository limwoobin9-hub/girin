import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_HEADERS, readAdminToken, SESSION_SECONDS } from "@/lib/admin-session";

export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const session = await readAdminToken(request.cookies.get(ADMIN_COOKIE)?.value);
  return session ? null : NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401, headers: ADMIN_HEADERS });
}

export function sameAdminOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.origin === origin && url.host === request.headers.get("host") && url.protocol === request.nextUrl.protocol;
  } catch { return false; }
}

export function setAdminCookie(response: NextResponse, token: string, clear = false) {
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/",
    maxAge: clear ? 0 : SESSION_SECONDS - 60,
  });
  return response;
}
