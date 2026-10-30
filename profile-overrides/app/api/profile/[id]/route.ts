import { NextRequest, NextResponse } from "next/server";
import { cohort, getList } from "@/lib/assessment-data";
import { requireAdmin } from "@/lib/admin-auth";
export const runtime = "edge";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const id = (await params).id;
  const student = cohort.find(row => row.id === id);
  if (!student) return NextResponse.json({ error: "학생을 찾지 못했습니다." }, { status: 404 });
  try {
    const items = await getList(student.id);
    if (!items) return NextResponse.json({ error: "학생의 과제 목록이 없습니다." }, { status: 404 });
    return NextResponse.json({ student: { id: student.id, name: student.name }, items },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "과제 목록을 불러오지 못했습니다." }, { status: 502 });
  }
}
