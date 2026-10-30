import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAnswerSimilarity } from "../lib/answer-similarity.ts";

function student(id, name, pattern, submitted = "2026-10-30T10:00:00Z") {
  return {
    id, name,
    item: { submitted_at: submitted },
    detail: { marks: pattern.map((entry, index) => ({
      no: index + 1,
      picked: entry.picked,
      ok: entry.ok,
    })) },
  };
}
const right = (picked = "1") => ({ picked, ok: true });
const wrong = (picked = "2") => ({ picked, ok: false });

test("strong patterns require multiple identical wrong answers and comparable questions", () => {
  const first = [...Array.from({ length: 5 }, () => wrong("2")), ...Array.from({ length: 5 }, () => right())];
  const second = [...Array.from({ length: 5 }, () => wrong("2")), ...Array.from({ length: 4 }, () => right()), wrong("3")];
  const result = analyzeAnswerSimilarity([student("a", "학생A", first), student("b", "학생B", second)]);
  assert.equal(result.participants, 2);
  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].group, "strong");
  assert.equal(result.pairs[0].sameWrong, 5);
  assert.equal(result.pairs[0].compared, 10);
});

test("partial matches can be flagged for review without requiring identical full answers", () => {
  const first = [...Array.from({ length: 5 }, () => wrong("2")), ...Array.from({ length: 5 }, () => right())];
  const second = [
    wrong("2"), wrong("2"), wrong("2"), wrong("3"), wrong("3"),
    ...Array.from({ length: 5 }, () => right()),
  ];
  const result = analyzeAnswerSimilarity([student("a", "학생A", first), student("b", "학생B", second)]);
  assert.equal(result.pairs[0]?.group, "review");
  assert.equal(result.pairs[0]?.sameWrong, 3);
  assert.equal(result.pairs[0]?.sameWrongRate, 60);
});

test("agreeing on correct answers alone does not trigger suspicion", () => {
  const first = [...Array.from({ length: 2 }, () => wrong("2")), ...Array.from({ length: 8 }, () => right())];
  const second = [...Array.from({ length: 2 }, () => wrong("3")), ...Array.from({ length: 8 }, () => right())];
  assert.equal(analyzeAnswerSimilarity([student("a", "A", first), student("b", "B", second)]).pairs.length, 0);
});

test("multiple-choice answer ordering is normalized", () => {
  const first = [...Array.from({ length: 4 }, () => wrong("2,1")), ...Array.from({ length: 6 }, () => right("3"))];
  const second = [...Array.from({ length: 4 }, () => wrong("1,2")), ...Array.from({ length: 6 }, () => right("3"))];
  const result = analyzeAnswerSimilarity([student("a", "A", first), student("b", "B", second)]);
  assert.equal(result.pairs[0]?.sameWrong, 4);
  assert.deepEqual(result.pairs[0]?.matched.map((m) => m.picked), Array(4).fill("1,2"));
});

test("not submitted or ungraded details are excluded", () => {
  const pattern = Array.from({ length: 10 }, () => wrong("2"));
  const result = analyzeAnswerSimilarity([
    student("a", "A", pattern),
    student("b", "B", pattern, ""),
    { id: "c", name: "C", item: { submitted_at: "2026-10-30T10:00:00Z" }, detail: null },
  ]);
  assert.equal(result.participants, 1);
  assert.equal(result.pairs.length, 0);
});
