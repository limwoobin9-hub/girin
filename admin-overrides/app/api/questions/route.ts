import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { readStudentQuestions } from "@/lib/student-questions";
import students from "@/data/students.json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers });
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const name = request.nextUrl.searchParams.get("name")?.trim().normalize("NFC") ?? "";
  if (!name || name.length > 80) return fail("학생 이름을 입력해 주세요.", 400);
  const student = students.find((row) => row.name.normalize("NFC") === name);
  if (!student) return fail("일치하는 학생이 없습니다. 동명이인은 이름 뒤의 숫자까지 입력해 주세요.", 404);
  const imageId = request.nextUrl.searchParams.get("image");
  if (imageId !== null && !/^[1-9]\d{0,11}$/.test(imageId)) return fail("질문 번호가 올바르지 않습니다.", 400);

  try {
    const items = await readStudentQuestions(student.id);
    if (imageId === null) return NextResponse.json({ name: student.name, items }, { headers });
    const question = items.find((row) => row.id === Number(imageId));
    if (!question?.image) return fail("해당 질문의 이미지를 찾지 못했습니다.", 404);
    const source = await fetch(`https://hw.girinkorean.com/api/my/${student.id}/questions/${question.id}/image`, {
      headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" }, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!source.ok || !source.body) return fail("질문 이미지를 불러오지 못했습니다.", source.status === 403 ? 403 : 502);
    const type = source.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type)) return fail("지원하지 않는 이미지 형식입니다.", 502);
    return new Response(source.body, { headers: { ...headers, "Content-Type": type, "Content-Disposition": "inline" } });
  } catch (reason) {
    const error = reason instanceof Error ? reason.message : "질문을 불러오지 못했습니다.";
    return fail(error.includes("fetch") || error.includes("timeout") ? "원본 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." : error, 502);
  }
}
