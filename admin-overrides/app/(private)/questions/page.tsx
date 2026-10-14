"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { PageTabs } from "@/components/page-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OwnedStudentQuestion } from "@/lib/student-questions";

type Result = { name: string; items: OwnedStudentQuestion[]; all: boolean; checked: number; total: number; unavailable: number };
type Batch = { items: OwnedStudentQuestion[]; checked: number; unavailable: number; totalStudents: number; totalBatches: number };

function orderQuestions(items: OwnedStudentQuestion[]) {
  return items.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.id - a.id || a.student_id.localeCompare(b.student_id));
}

function date(value: string | null) {
  return value && /^\d{4}-\d\d-\d\d/.test(value) ? value.slice(0, 16).replace("T", " ") : "";
}

export default function QuestionsPage() {
  const [name, setName] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = name.trim().normalize("NFC");
    if (!query) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true); setError(""); setResult(null); setFailedImages([]);
    try {
      const response = await fetch(`/api/questions?name=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "질문을 불러오지 못했습니다.");
      if (typeof data.name !== "string" || !Array.isArray(data.items)) throw new Error("질문 목록을 읽지 못했습니다.");
      setResult({ ...data, all: false, checked: 1, total: 1, unavailable: 0 });
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "조회에 실패했습니다."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  async function lookupAll() {
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true); setError(""); setFailedImages([]);
    setResult({ name: "전체 학생", items: [], all: true, checked: 0, total: 0, unavailable: 0 });
    const failedBatches: number[] = [];
    async function readBatch(batch: number) {
      const response = await fetch(`/api/questions?all=1&batch=${batch}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "전체 질문을 불러오지 못했습니다.");
      const page = data as Batch;
      if (!Array.isArray(page.items) || !Number.isInteger(page.totalBatches) || page.totalBatches < 1 || page.totalBatches > 100 ||
          !Number.isInteger(page.checked) || page.checked < 0 || !Number.isInteger(page.unavailable) || page.unavailable < 0 ||
          !Number.isInteger(page.totalStudents)) throw new Error("질문 목록을 읽지 못했습니다.");
      setResult((previous) => previous ? { ...previous,
        items: orderQuestions([...previous.items, ...page.items]), checked: previous.checked + page.checked,
        total: page.totalStudents, unavailable: previous.unavailable + page.unavailable,
      } : previous);
      return page.totalBatches;
    }
    try {
      const totalBatches = await readBatch(0);
      let next = 1;
      await Promise.all(Array.from({ length: Math.min(2, totalBatches - 1) }, async () => {
        while (next < totalBatches && !controller.signal.aborted) {
          const batch = next++;
          try { await readBatch(batch); } catch { if (!controller.signal.aborted) failedBatches.push(batch); }
        }
      }));
      if (failedBatches.length && !controller.signal.aborted) setError("일부 질문 목록을 불러오지 못했습니다. 조회된 기록만 표시합니다. 전체 확인 버튼으로 다시 조회할 수 있습니다.");
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "전체 조회에 실패했습니다."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  return <>
    <header className="site-header"><div className="container"><h1>질문·답변</h1></div></header>
    <main className="container main-content">
      <PageTabs active="questions" />
      <section className="search-panel" aria-labelledby="question-search-heading">
        <h2 id="question-search-heading">질문·답변 조회</h2>
        <form className="search-form" onSubmit={lookup}>
          <label className="sr-only" htmlFor="question-name">학생 이름</label>
          <Input id="question-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="학생 이름 입력" autoComplete="off" maxLength={80} required />
          <Button type="submit" disabled={loading}>{loading ? "조회 중…" : "조회하기"}</Button>
        </form>
        <Button type="button" variant="outline" className="qa-all-button" onClick={lookupAll} disabled={loading}>전체 질문·답변 확인</Button>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {loading && <div className="initial-empty" role="status">{result?.all && result.total ? `전체 ${result.total}명 중 ${result.checked}명 확인 중…` : "질문·답변을 불러오는 중…"}</div>}
      {result && <section className="group" aria-live="polite">
        <div className="group-heading"><h2>{result.name}</h2><span>질문 {result.items.length}개 · 답변 {result.items.filter((item) => item.answer.trim()).length}개</span></div>
        {result.all && result.checked > 0 && <p className="qa-scan-summary">{result.checked}/{result.total}명 확인{result.unavailable > 0 ? ` · ${result.unavailable}명 연결 실패` : ""}</p>}
        {result.unavailable > 0 && <p className="ranking-warning">연결하지 못한 학생의 기록은 포함되지 않았습니다.</p>}
        <div className="cards">{result.items.map((item) => <article className="homework-card qa-card" key={`${item.student_id}-${item.id}`}>
          <div className="qa-heading"><h3>{item.student_name} · 질문 #{item.id}</h3><span className={`status-pill ${item.answer.trim() ? "is-done" : ""}`}>{item.answer.trim() ? "답변 완료" : "답변 대기"}</span></div>
          {date(item.created_at) && <p className="qa-date">{date(item.created_at)}</p>}
          <div className="qa-content">
            <section className="qa-question"><h4>학생 질문</h4>
              {item.body && <p className="qa-text">{item.body}</p>}
              {!item.body && item.image && <p className="qa-empty">아래 첨부 이미지로 질문했습니다.</p>}
              {!item.body && !item.image && <p className="qa-empty">질문 내용이 없습니다.</p>}
            </section>
            <section className="qa-answer"><h4>선생님 답변</h4>
              {item.answer.trim() ? <p className="qa-text">{item.answer}</p> : <p className="qa-empty">아직 답변이 없습니다.</p>}
              {date(item.answered_at) && <p className="qa-date">{date(item.answered_at)}</p>}
            </section>
          </div>
          {item.image && <div className="qa-attachment">
            <h4>질문 첨부 이미지</h4>
            {failedImages.includes(`${item.student_id}-${item.id}`) ? <p className="qa-empty">이미지를 불러오지 못했습니다.</p> :
              // eslint-disable-next-line @next/next/no-img-element
              <img className="qa-image" src={`/api/questions?${new URLSearchParams({ name: item.student_name, image: String(item.id) })}`} alt={`${item.student_name} 질문 ${item.id} 첨부 이미지`} loading="lazy" onError={() => setFailedImages((previous) => [...previous, `${item.student_id}-${item.id}`])} />}
          </div>}
        </article>)}</div>
        {!loading && !result.items.length && !error && <div className="empty-card">{result.unavailable === result.checked && result.unavailable > 0 ? "질문 목록을 가져오지 못했습니다." : "조회된 학생에게 등록된 질문이 없습니다."}</div>}
      </section>}
      {!loading && !result && !error && <div className="initial-empty">학생을 검색하거나 전체 질문·답변 확인을 눌러 주세요.</div>}
    </main>
  </>;
}
