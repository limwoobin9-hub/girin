export type StudentQuestion = {
  id: number;
  body: string;
  answer: string;
  image: boolean;
  created_at: string | null;
  answered_at: string | null;
};
export type QuestionStudent = { id: string; name: string };
export type OwnedStudentQuestion = StudentQuestion & { student_id: string; student_name: string };

export function withQuestionOwner(student: QuestionStudent, items: StudentQuestion[]): OwnedStudentQuestion[] {
  return items.map((item) => ({ ...item, student_id: student.id, student_name: student.name }));
}

export async function readQuestionsForStudents(
  students: QuestionStudent[],
  read: (id: string) => Promise<StudentQuestion[]> = readStudentQuestions,
) {
  const records: OwnedStudentQuestion[][] = new Array(students.length);
  const failedStudents: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, students.length) }, async () => {
    while (next < students.length) {
      const index = next++;
      const student = students[index];
      try { records[index] = withQuestionOwner(student, await read(student.id)); }
      catch { records[index] = []; failedStudents.push(student.name); }
    }
  }));
  return { items: records.flat(), checked: students.length, unavailable: failedStudents.length };
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

export function normalizeQuestions(value: unknown): StudentQuestion[] {
  const source = Array.isArray(value) ? value : value && typeof value === "object"
    ? (value as Record<string, unknown>).questions : null;
  if (!Array.isArray(source)) throw new Error("질문 목록의 형식이 올바르지 않습니다.");
  const seen = new Set<number>();
  return source.slice(0, 500).flatMap((raw): StudentQuestion[] => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "number" || typeof row.id === "string" ? Number(row.id) : NaN;
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      body: text(row.body, 30000),
      answer: text(row.answer, 50000),
      image: Boolean(row.image),
      created_at: typeof row.created_at === "string" ? row.created_at.slice(0, 50) : null,
      answered_at: typeof row.answered_at === "string" ? row.answered_at.slice(0, 50) : null,
    }];
  }).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.id - a.id);
}

export async function readStudentQuestions(studentId: string): Promise<StudentQuestion[]> {
  const response = await fetch(`https://hw.girinkorean.com/api/my/${studentId}/questions`, {
    headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("원본 서비스에서 이 계정의 질문 조회를 허용하지 않습니다.");
    if (response.status === 404) throw new Error("해당 계정의 질문 목록을 찾지 못했습니다.");
    throw new Error("질문 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return normalizeQuestions(await response.json());
}
