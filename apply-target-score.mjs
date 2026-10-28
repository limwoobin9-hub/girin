import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const path = "app/(private)/submit/page.tsx";
let source = readFileSync(path, "utf8");
function replaceOnce(needle, replacement, label) {
  if (!source.includes(needle)) throw new Error("Target-score installer: missing " + label);
  source = source.replace(needle, replacement);
}
replaceOnce('import { loadBatches } from "@/lib/analysis";',
  'import { loadBatches } from "@/lib/analysis";\nimport { buildTargetScorePlan } from "@/lib/target-score";', "analysis import");
replaceOnce('  const [answers, setAnswers] = useState<Record<number, string>>({});',
  '  const [answers, setAnswers] = useState<Record<number, string>>({});\n' +
  '  const [targetScore, setTargetScore] = useState("80");\n' +
  '  const [autoBusy, setAutoBusy] = useState(false);\n' +
  '  const [autoProgress, setAutoProgress] = useState("");', "answer state");
replaceOnce('      setSelected(detail);',
  '      setSelected(detail);\n' +
  '      setTargetScore(String(Math.round(detail.questions.reduce((sum, q) => sum + Number(q.point || 0), 0) * 80) / 100));', "detail loaded");
const handler = "\n  async function autoSubmitTarget(item: Homework) {\n    if (!selected || selected.id !== item.id || selected.submission || autoBusy || extracting || submitting) return;\n    setError(\"\");\n    setNotice(\"\");\n    setAutoBusy(true);\n    setAutoProgress(\"채점 기록을 불러오는 중...\");\n    try {\n      const key = assessmentKey({ id: item.id, kind: \"hw\", title: item.title, due_at: item.due_at });\n      const data = await loadBatches(\"detail\", (done, total) => {\n        setAutoProgress(\"채점 기록 조회 \" + done + \"/\" + total + \"명\");\n      }, key);\n      const plan = buildTargetScorePlan(selected.questions, data.rows, key, Number(targetScore));\n      setAnswers(plan.answers);\n      setAutoProgress(\"\");\n      setNotice(\"목표 \" + plan.target + \"점 / 예상 \" + plan.predicted +\n        \"점 · 오답 문항: \" + plan.wrongQuestions.join(\", \"));\n      await submit(plan.answers);\n    } catch (reason) {\n      setError(reason instanceof Error ? reason.message : \"목표 점수 답안을 만들지 못했습니다.\");\n    } finally {\n      setAutoBusy(false);\n      setAutoProgress(\"\");\n    }\n  }\n\n";

replaceOnce('  const complete = selected?.questions.filter',
  handler + '  const complete = selected?.questions.filter', "handler");
const panel = "\n              <div className=\"target-score-panel\">\n                <strong>목표 점수 자동 제출</strong>\n                <p className=\"answer-note\">문항별 배점, 정답률과 가장 자주 선택된 오답을 분석해 목표 점수에 가장 가까운 답안을 생성합니다. 제출 전에 확인 창이 표시됩니다.</p>\n                <div className=\"target-score-controls\">\n                  <label htmlFor=\"target-score-input\">목표 점수 (만점 {Math.round(selected.questions.reduce((sum, q) => sum + Number(q.point || 0), 0) * 100) / 100}점)</label>\n                  <Input id=\"target-score-input\" type=\"number\" step=\"0.01\" min=\"0\"\n                    max={selected.questions.reduce((sum, q) => sum + Number(q.point || 0), 0)}\n                    value={targetScore} onChange={(event) => setTargetScore(event.target.value)} disabled={autoBusy || submitting} />\n                  <Button type=\"button\" onClick={() => void autoSubmitTarget(item)}\n                    disabled={autoBusy || submitting || extracting || !targetScore.trim()}>\n                    {autoBusy ? \"분석 중...\" : \"목표 점수로 자동 제출\"}\n                  </Button>\n                </div>\n                {autoProgress && <p className=\"answer-note\" role=\"status\">{autoProgress}</p>}\n                <p className=\"answer-note\">정답 근거가 부족한 문항이 있으면 제출하지 않습니다. 예상 점수와 실제 채점 점수는 다를 수 있습니다.</p>\n              </div>\n";

replaceOnce('              <h4>답 입력 · {complete}/{selected.questions.length}</h4>',
  panel + '              <h4>답 입력 · {complete}/{selected.questions.length}</h4>', "form");
writeFileSync(path, source);
appendFileSync("app/globals.css", "\n/* Target-score controls */\n.target-score-panel { border: 1px solid #c9d7ec; border-radius: 14px; background: #f4f8ff; padding: 17px; margin: 16px 0 20px; }\n.target-score-panel > strong { color: #173b73; font-size: 1.06rem; }\n.target-score-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; margin: 12px 0; }\n.target-score-controls label { width: 100%; color: #334e72; font-weight: 700; font-size: .89rem; }\n.target-score-controls input { width: min(180px, 100%); background: #fff; }\n.target-score-controls button { min-height: 40px; }\n@media (max-width: 600px) { .target-score-panel { padding: 12px; } .target-score-controls input { flex: 1; min-width: 85px; } .target-score-controls button { flex: 2; } }\n");
console.log("Target-score controls installed.");
