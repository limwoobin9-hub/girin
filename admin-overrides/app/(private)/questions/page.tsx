"use client";

import { FormEvent, useState } from "react";
import { PageTabs } from "@/components/page-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StudentQuestion } from "@/lib/student-questions";

type Result = { name: string; items: StudentQuestion[] };

function date(value: string | null) {
  return value && /^\d{4}-\d\d-\d\d/.test(value) ? value.slice(0, 16).replace("T", " ") : "";
}

export default function QuestionsPage() {
  const [name, setName] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [failedImages, setFailedImages] = useState<number[]>([]);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = name.trim().normalize("NFC");
    if (!query) return;
    setLoading(true); setError(""); setResult(null); setFailedImages([]);
    try {
      const response = await fetch(`/api/questions?name=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "질문을 불러오지 못했습니다.");
      if (typeof data.name !== "string" || !Array.isArray(data.items)) throw new Error("질문 목록을 읽지 못했습니다.");
      setResult(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "조회에 실패했습니다."); }
    finally { setLoading(false); }
  }

  return <>
    <header className="site-header"><div className="container"><h1>질문·답변</h1></div></header>
    <main className="container main-content">
      <PageTabs active="questions" />
      <section className="search-panel" aria-labelledby="question-search-heading">
        <h2 id="question-search-heading">학생 검색</h2>
        <form className="search-form" onSubmit={lookup}>
          <label className="sr-only" htmlFor="question-name">학생 이름</label>
          <Input id="question-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="학생 이름 입력" autoComplete="off" maxLength={80} required />
          <Button type="submit" disabled={loading}>{loading ? "조회 중…" : "조회하기"}</Button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {loading && <div className="initial-empty" role="status">질문·답변을 불러오는 중…</div>}
      {result && <section className="group" aria-live="polite">
        <div className="group-heading"><h2>{result.name}</h2><span>질문 {result.items.length}개 · 답변 {result.items.filter((item) => item.answer.trim()).length}개</span></div>
        <div className="cards">{result.items.map((item) => <article className="homework-card qa-card" key={item.id}>
          <div className="qa-heading"><h3>질문 #{item.id}</h3><span className={`status-pill ${item.answer.trim() ? "is-done" : ""}`}>{item.answer.trim() ? "답변 완료" : "답변 대기"}</span></div>
          {date(item.created_at) && <p className="qa-date">{date(item.created_at)}</p>}
          <div className="qa-content">
            <section className="qa-question"><h4>학생 질문</h4>
              {item.body && <p className="qa-text">{item.body}</p>}
              {item.image && (failedImages.includes(item.id) ? <p className="qa-empty">이미지를 불러오지 못했습니다.</p> :
                // eslint-disable-next-line @next/next/no-img-element
                <img className="qa-image" src={`/api/questions?${new URLSearchParams({ name: result.name, image: String(item.id) })}`} alt={`${result.name} 질문 ${item.id} 첨부 이미지`} loading="lazy" onError={() => setFailedImages((previous) => [...previous, item.id])} />)}
              {!item.body && !item.image && <p className="qa-empty">질문 내용이 없습니다.</p>}
            </section>
            <section className="qa-answer"><h4>선생님 답변</h4>
              {item.answer.trim() ? <p className="qa-text">{item.answer}</p> : <p className="qa-empty">아직 답변이 없습니다.</p>}
              {date(item.answered_at) && <p className="qa-date">{date(item.answered_at)}</p>}
            </section>
          </div>
        </article>)}</div>
        {!result.items.length && <div className="empty-card">등록된 질문이 없습니다.</div>}
      </section>}
      {!loading && !result && !error && <div className="initial-empty">학생 이름을 입력해 주세요.</div>}
    </main>
  </>;
}
