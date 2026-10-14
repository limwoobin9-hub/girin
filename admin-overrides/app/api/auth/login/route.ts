import { NextRequest, NextResponse } from "next/server";
import { sameAdminOrigin, setAdminCookie } from "@/lib/admin-auth";
import { ADMIN_HEADERS, issueAdminSession, safeReturnTo } from "@/lib/admin-session";
import { adminConfigured, verifyAdminPassword } from "@/lib/admin-password";
import { resetLoginAttempts, takeLoginAttempt } from "@/lib/admin-throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameAdminOrigin(request)) return NextResponse.json({ error: "요청 출처를 확인할 수 없습니다." }, { status: 403, headers: ADMIN_HEADERS });
  if (!adminConfigured()) return NextResponse.json({ error: "관리자 로그인 설정을 확인해 주세요." }, { status: 503, headers: ADMIN_HEADERS });
  const ip = (request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim().slice(0, 100);
  const retryAfter = takeLoginAttempt(ip);
  if (retryAfter) return NextResponse.json({ error: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { ...ADMIN_HEADERS, "Retry-After": String(retryAfter) } });
  let data: unknown;
  try { data = await request.json(); } catch { return NextResponse.json({ error: "아이디와 비밀번호를 입력해 주세요." }, { status: 400, headers: ADMIN_HEADERS }); }
  const input = data as { username?: unknown; password?: unknown; next?: unknown } | null;
  const username = typeof input?.username === "string" ? input.username.trim() : "";
  const password = typeof input?.password === "string" ? input.password : "";
  if (!username || username.length > 80 || !password || password.length > 200) return NextResponse.json({ error: "아이디와 비밀번호를 확인해 주세요." }, { status: 400, headers: ADMIN_HEADERS });
  try {
    if (!await verifyAdminPassword(username, password)) return NextResponse.json({ error: "아이디 또는 비밀번호가 맞지 않습니다." }, { status: 401, headers: ADMIN_HEADERS });
    const response = NextResponse.json({ ok: true, redirectTo: safeReturnTo(input?.next) }, { headers: ADMIN_HEADERS });
    setAdminCookie(response, await issueAdminSession());
    resetLoginAttempts(ip);
    return response;
  } catch {
    return NextResponse.json({ error: "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503, headers: ADMIN_HEADERS });
  }
}
