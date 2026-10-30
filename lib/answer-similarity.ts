/** Exploratory pattern matching, NOT a probability of cheating or proof of misconduct. */
export type AnswerMark = { no: number; picked: string | null; ok: boolean | null };
export type StudentSubmission = {
  id: string;
  name: string;
  item?: { submitted_at: string | null };
  detail?: { marks: AnswerMark[] } | null;
};

export type MatchingQuestion = {
  no: number;
  picked: string;
  rarityWeight: number;
};

export type AnswerPair = {
  pairId: string;
  first: { id: string; name: string; submittedAt: string | null };
  second: { id: string; name: string; submittedAt: string | null };
  compared: number;
  bothWrong: number;
  sameWrong: number;
  sameWrongRate: number;
  sameAnswer: number;
  rareWeight: number;
  matched: MatchingQuestion[];
  group: "strong" | "review";
};

function answer(value: string | null): string | null {
  if (!value || !/^\d{1,2}(?:,\d{1,2})*$/.test(value)) return null;
  const numbers = value.split(",").map(Number);
  if (numbers.some((n) => n < 1 || n > 20) || new Set(numbers).size !== numbers.length) return null;
  return numbers.sort((a, b) => a - b).join(",");
}

type Prepared = {
  id: string;
  name: string;
  submittedAt: string | null;
  marks: Map<number, { picked: string; ok: boolean }>;
};

export function analyzeAnswerSimilarity(rows: StudentSubmission[]): {
  participants: number;
  reviewedQuestions: number;
  pairs: AnswerPair[];
} {
  const students: Prepared[] = [];
  const frequency = new Map<number, Map<string, number>>();
  const attemptedWrong = new Map<number, number>();
  const allQuestions = new Set<number>();

  for (const row of rows) {
    if (!row.item?.submitted_at || !row.detail?.marks?.length || !row.id) continue;
    const marks = new Map<number, { picked: string; ok: boolean }>();
    for (const mark of row.detail.marks) {
      if (!Number.isInteger(mark.no) || mark.no < 1 || mark.no > 300 || typeof mark.ok !== "boolean") continue;
      const picked = answer(mark.picked);
      if (!picked || marks.has(mark.no)) continue;
      marks.set(mark.no, { picked, ok: mark.ok });
      allQuestions.add(mark.no);
      if (mark.ok === false) {
        attemptedWrong.set(mark.no, (attemptedWrong.get(mark.no) ?? 0) + 1);
        const current = frequency.get(mark.no) ?? new Map<string, number>();
        current.set(picked, (current.get(picked) ?? 0) + 1);
        frequency.set(mark.no, current);
      }
    }
    if (marks.size) students.push({
      id: row.id,
      name: row.name,
      submittedAt: row.item.submitted_at,
      marks,
    });
  }

  const pairs: AnswerPair[] = [];
  for (let i = 0; i < students.length; i++) {
    const a = students[i];
    for (let j = i + 1; j < students.length; j++) {
      const b = students[j];
      // Count shared wrong selections. Correct-answer agreement is not evidence.
      let compared = 0, bothWrong = 0, sameAnswer = 0, rareWeight = 0;
      const matched: MatchingQuestion[] = [];
      for (const [no, am] of a.marks) {
        const bm = b.marks.get(no);
        if (!bm) continue;
        compared++;
        if (am.picked === bm.picked) sameAnswer++;
        if (am.ok !== false || bm.ok !== false) continue;
        bothWrong++;
        if (am.picked !== bm.picked) continue;
        const occurrences = frequency.get(no)?.get(am.picked) ?? 0;
        const base = attemptedWrong.get(no) ?? 0;
        const prevalence = base > 0 ? occurrences / base : 1;
        // Very common distractors receive little weight. Rare errors get more.
        const rarityWeight = Math.max(1, Math.min(4, -Math.log2(Math.max(0.01, prevalence))));
        rareWeight += rarityWeight;
        matched.push({ no, picked: am.picked, rarityWeight });
      }
      const sameWrong = matched.length;
      const rate = bothWrong ? sameWrong / bothWrong : 0;
      if (compared < 4 || bothWrong < 2) continue;
      const strong = sameWrong >= 5 && compared >= 8 && rate >= 0.8 && rareWeight >= 5;
      const review = (sameWrong >= 3 && rate >= 0.55 && compared >= 5) ||
        (sameWrong >= 2 && rate >= 0.65 && rareWeight >= 6 && compared >= 5);
      if (!strong && !review) continue;
      const pairId = [a.id, b.id].sort().join("|");
      pairs.push({
        pairId,
        first: { id: a.id, name: a.name, submittedAt: a.submittedAt },
        second: { id: b.id, name: b.name, submittedAt: b.submittedAt },
        compared, bothWrong, sameWrong,
        sameWrongRate: Math.round(rate * 1000) / 10,
        sameAnswer, rareWeight: Math.round(rareWeight * 10) / 10,
        matched: matched.sort((x, y) => x.no - y.no),
        group: strong ? "strong" : "review",
      });
    }
  }
  pairs.sort((a, b) =>
    Number(b.group === "strong") - Number(a.group === "strong") ||
    b.sameWrong - a.sameWrong ||
    b.rareWeight - a.rareWeight ||
    b.sameWrongRate - a.sameWrongRate ||
    a.pairId.localeCompare(b.pairId));
  return { participants: students.length, reviewedQuestions: allQuestions.size, pairs };
}
