import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { ADMIN_HEADERS } from "@/lib/admin-session";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ username: "admin", role: "admin" }, { headers: ADMIN_HEADERS });
}
