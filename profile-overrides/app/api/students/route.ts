import { NextRequest, NextResponse } from "next/server";
import { cohort } from "@/lib/assessment-data";
import { requireAdmin } from "@/lib/admin-auth";
export const runtime = "edge";
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ students: cohort.map(({ id, name }) => ({ id, name })) },
    { headers: { "Cache-Control": "private, max-age=120" } });
}
