import type { StudentRow } from "@/lib/analysis";
import { assessmentKey } from "@/lib/ranking";

export type TargetQuestion = {
  no: number;
  choices: number;
  multi: number;
  point: number;
};

export type TargetScorePlan = {
  answers: Record<number, string>;
  target: number;
  predicted: number;
  total: number;
  difference: number;
  wrongQuestions: number[];
  evidenceStudents: number;
};

function normalized(value: unknown, question: TargetQuestion): string | null {
  if (typeof value !== "string") return null;
  if (!/^[0-9]+(,[0-9]+)*$/.test(value)) return null;
  const choices = value.split(",").map(Number);
  if (choices.length !== question.multi || new Set(choices).size !== choices.length ||
      choices.some((n) => !Number.isInteger(n) || n < 1 || n > question.choices)) return null;
  return choices.sort((a, b) => a - b).join(",");
}

function fallbackWrong(question: TargetQuestion, answer: string): string | null {
  const choices: number[] = [];
  let candidate: string | null = null;
  const visit = (next: number) => {
    if (candidate) return;
    if (choices.length === question.multi) {
      const result = choices.join(",");
      if (result !== answer) candidate = result;
      return;
    }
    for (let choice = next; choice <= question.choices; choice++) {
      choices.push(choice);
      visit(choice + 1);
      choices.pop();
      if (candidate) return;
    }
  };
  visit(1);
  return candidate;
}

/** Scores are computed in hundredths to avoid float instability in the subset-sum DP. */
export function buildTargetScorePlan(
  questions: TargetQuestion[],
  rows: StudentRow[],
  key: string,
  targetScore: number,
): TargetScorePlan {
  if (!questions.length || questions.length > 100) throw new Error("문항 목록을 확인할 수 없습니다.");
  const pointUnits = questions.map((q) => Math.round(Number(q.point) * 100));
  if (questions.some((q, i) => !Number.isInteger(q.no) || !Number.isInteger(q.choices) ||
      !Number.isInteger(q.multi) || q.choices < 2 || q.choices > 10 || q.multi < 1 ||
      q.multi > q.choices || !Number.isFinite(q.point) || pointUnits[i] < 0)) {
    throw new Error("일부 문항의 선택지 또는 배점 정보가 올바르지 않습니다.");
  }
  const totalUnits = pointUnits.reduce((a, b) => a + b, 0);
  if (totalUnits <= 0) throw new Error("배점 정보가 없어 목표 점수를 계산할 수 없습니다.");
  const goalUnits = Math.round(targetScore * 100);
  if (!Number.isFinite(targetScore) || goalUnits < 0 || goalUnits > totalUnits) {
    throw new Error("목표 점수는 0점부터 만점까지 입력해 주세요.");
  }

  const relevant = rows.filter((row) => row.item && assessmentKey(row.item) === key &&
    Array.isArray(row.detail?.marks) && row.detail.marks.length > 0);
  if (!relevant.length) throw new Error("이 숙제의 채점 완료 기록이 없어 목표 점수 답안을 만들 수 없습니다.");

  type Candidate = { question: TargetQuestion; right: string; wrong: string; units: number; priority: number };
  const candidates: Candidate[] = [];
  const missing: number[] = [];
  for (const [index, q] of questions.entries()) {
    const rightVotes = new Map<string, number>();
    const wrongVotes = new Map<string, number>();
    let assessed = 0, wrongCount = 0;
    for (const row of relevant) {
      const mark = row.detail?.marks.find((entry) => entry.no === q.no);
      if (!mark || mark.ok === null) continue;
      const picked = normalized(mark.picked, q);
      if (!picked) continue;
      assessed++;
      if (mark.ok) rightVotes.set(picked, (rightVotes.get(picked) ?? 0) + 1);
      else {
        wrongCount++;
        wrongVotes.set(picked, (wrongVotes.get(picked) ?? 0) + 1);
      }
    }
    if (rightVotes.size !== 1) { missing.push(q.no); continue; }
    const right = rightVotes.keys().next().value as string;
    const popularWrong = [...wrongVotes.entries()]
      .filter(([choice]) => choice !== right)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const wrong = popularWrong?.[0] ?? fallbackWrong(q, right);
    if (!wrong) { missing.push(q.no); continue; }
    const errorRate = assessed ? wrongCount / assessed : 0;
    const priority = errorRate * 100 + Math.log1p(popularWrong?.[1] ?? 0) * 10;
    candidates.push({ question: q, right, wrong, units: pointUnits[index], priority });
  }
  if (missing.length) {
    throw new Error("정답 근거가 부족하거나 충돌하는 문항: " +
      missing.join(", ") + "번. 자동 제출하지 않았습니다.");
  }

  // Primary objective: minimize the absolute score difference.
  // Secondary objective: wrong-answer choices concentrate on high-error-rate questions.
  type State = { priority: number; wrongQuestions: number[] };
  let states = new Map<number, State>([[0, { priority: 0, wrongQuestions: [] }]]);
  for (const candidate of candidates) {
    const next = new Map(states);
    for (const [wrongUnits, prior] of states) {
      const sum = wrongUnits + candidate.units;
      const priority = prior.priority + candidate.priority;
      const existing = next.get(sum);
      if (!existing || priority > existing.priority) {
        next.set(sum, {
          priority,
          wrongQuestions: [...prior.wrongQuestions, candidate.question.no],
        });
      }
    }
    states = next;
  }
  let best: { wrongUnits: number; state: State; difference: number } | null = null;
  for (const [wrongUnits, state] of states) {
    const difference = Math.abs(totalUnits - wrongUnits - goalUnits);
    if (!best || difference < best.difference ||
        (difference === best.difference && state.priority > best.state.priority)) {
      best = { wrongUnits, state, difference };
    }
  }
  if (!best) throw new Error("목표 점수에 맞는 답안 조합을 찾지 못했습니다.");
  const wrongSet = new Set(best.state.wrongQuestions);
  const answers: Record<number, string> = {};
  for (const candidate of candidates) {
    answers[candidate.question.no] = wrongSet.has(candidate.question.no) ? candidate.wrong : candidate.right;
  }
  return {
    answers,
    target: goalUnits / 100,
    predicted: (totalUnits - best.wrongUnits) / 100,
    total: totalUnits / 100,
    difference: best.difference / 100,
    wrongQuestions: best.state.wrongQuestions,
    evidenceStudents: relevant.length,
  };
}
