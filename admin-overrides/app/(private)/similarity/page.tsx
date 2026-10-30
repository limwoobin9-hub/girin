"use client";

import { useEffect, useState } from "react";
import { PageTabs } from "@/components/page-tabs";
import { Button } from "@/components/ui/button";
import { loadBatches, type StudentRow } from "@/lib/analysis";
import type { Assessment } from "@/lib/assessment-data";
import { analyzeAnswerSimilarity, type AnswerPair } from "@/lib/answer-similarity";
import { assessmentKey } from "@/lib/ranking";

type HomeworkSummary = {
  key: string;
  item: Assessment;
  known: number;
  submitted: number;
};
type Review = { reason: string; date: string };
type ReviewStore = Record<string, Review>;
type Current = {
  summary: HomeworkSummary;
  pairs: AnswerPair[];
  participants: number;
  reviewedQuestions: number;
  unavailable: number;
  detailCount: number;
};
const STORAGE_KEY = "girin-study-similarity-reviewed-v1";

function timeLabel(value: string | null): string {
  if (!value) return "기록 없음";
  const valueDate = new Date(value);
  if (/(Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(valueDate.getTime())) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(valueDate);
  }
  // With no time zone in the source, display unchanged rather than guess.
  return value.replace("T", " ").slice(0, 19);
}

function timeGap(first: string | null, second: string | null): string | null {
  if (!first || !second || !/(Z|[+-]\d\d:\d\d)$/.test(first) || !/(Z|[+-]\d\d:\d\d)$/.test(second)) return null;
  const delta = Math.abs(Date.parse(first) - Date.parse(second));
  if (!Number.isFinite(delta)) return null;
  const minutes = Math.round(delta / 60000);
  return minutes < 60 ? minutes + "분" : Math.floor(minutes / 60) + "시간 " + (minutes % 60) + "분";
}

function storeKey(homeworkKey: string, pairId: string) {
  return JSON.stringify([homeworkKey, pairId]);
}

function readReviews(): ReviewStore {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: ReviewStore = {};
    for (const [key, record] of Object.entries(value)) {
      if (record && typeof record === "object" && "reason" in record && "date" in record &&
        typeof record.reason === "string" && typeof record.date === "string") {
        result[key] = { reason: record.reason, date: record.date };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export default function SimilarityPage() {
  const [homeworks, setHomeworks] = useState<HomeworkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Current | null>(null);
  const [reviews, setReviews] = useState<ReviewStore>({});

  useEffect(() => {
    setReviews(readReviews());
    let active = true;
    loadBatches("list", (done, total) => {
      if (active) setProgress({ done, total });
    }).then((data) => {
      if (!active) return;
      const grouped = new Map<string, HomeworkSummary>();
      for (const row of data.rows) {
        for (const item of row.items ?? []) {
          if (item.kind !== "hw") continue;
          const key = assessmentKey(item);
          const entry = grouped.get(key) ?? { key, item, known: 0, submitted: 0 };
          entry.known++;
          if (item.submitted_at) entry.submitted++;
          grouped.set(key, entry);
        }
      }
      setHomeworks([...grouped.values()].filter((entry) => entry.submitted > 0)
        .sort((a, b) => (b.item.open_at || b.item.due_at || "").localeCompare(a.item.open_at || a.item.due_at || "") || b.item.id - a.item.id));
      if (data.unavailable > 0) {
        setError(data.unavailable + "명의 숙제 목록을 조회하지 못했습니다. 확인된 기록만 표시합니다.");
      }
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "숙제 목록을 조회하지 못했습니다.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function inspect(summary: HomeworkSummary) {
    if (analyzing) return;
    if (selected?.summary.key === summary.key) {
      setSelected(null);
      return;
    }
    setSelected(null);
    setAnalyzing(true);
    setProgress({ done: 0, total: 0 });
    setError("");
    try {
      const data = await loadBatches("detail", (done, total) => setProgress({ done, total }), summary.key);
      const rows: StudentRow[] = data.rows.filter((row) => row.item && assessmentKey(row.item) === summary.key);
      const calculated = analyzeAnswerSimilarity(rows);
      setSelected({
        summary,
        ...calculated,
        unavailable: data.unavailable,
        detailCount: rows.filter((row) => !!row.detail?.marks.length).length,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "유사도 분석에 실패했습니다.");
    } finally {
      setAnalyzing(false);
    }
  }

  function updateReview(pair: AnswerPair, confirmed: boolean) {
    if (!selected) return;
    const key = storeKey(selected.summary.key, pair.pairId);
    if (confirmed) {
      const reason = window.prompt(
        "동일한 오답만으로 부정행위를 확정할 수 없습니다.\n추가로 확인한 근거와 관리자 판단 사유를 기록해 주세요.",
      )?.trim();
      if (!reason) return;
      const next = { ...reviews, [key]: { reason: reason.slice(0, 600), date: new Date().toISOString() } };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setReviews(next);
      } catch {
        setError("브라우저에 확정 내역을 저장하지 못했습니다.");
      }
      return;
    }
    if (!window.confirm("이 학생 쌍의 관리자 확정 표시를 해제할까요?")) return;
    const next = { ...reviews };
    delete next[key];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setReviews(next);
    } catch {
      setError("변경 내역을 저장하지 못했습니다.");
    }
  }

  function pairCard(pair: AnswerPair) {
    if (!selected) return null;
    const review = reviews[storeKey(selected.summary.key, pair.pairId)];
    const gap = timeGap(pair.first.submittedAt, pair.second.submittedAt);
    return <article className="similarity-pair" key={pair.pairId}>
      <div className="similarity-pair-head">
        <strong>{pair.first.name} · {pair.second.name}</strong>
        <span className={"similarity-tag " + (review ? "is-confirmed" : pair.group === "strong" ? "is-strong" : "is-review")}>
          {review ? "관리자 확정" : pair.group === "strong" ? "강한 패턴 일치" : "유사 패턴 의심"}
        </span>
      </div>
      <div className="similarity-metrics">
        <span>공통 오답 선택 <b>{pair.sameWrong}문항</b></span>
        <span>둘 다 틀린 문항 중 일치 <b>{pair.sameWrongRate}%</b></span>
        <span>비교 가능 문항 <b>{pair.compared}개</b></span>
        <span>전체 선택 동일 <b>{pair.sameAnswer}개</b></span>
      </div>
      <div className="similarity-times">
        <div><span>{pair.first.name} 제출</span><strong>{timeLabel(pair.first.submittedAt)}</strong></div>
        <div><span>{pair.second.name} 제출</span><strong>{timeLabel(pair.second.submittedAt)}</strong></div>
        {gap && <span className="similarity-gap">제출 간격 {gap}</span>}
      </div>
      <details className="similarity-details">
        <summary>같은 오답 문항과 선택지 확인 ({pair.matched.length}개)</summary>
        <div className="similarity-chips">
          {pair.matched.map((mark) => <span key={mark.no}>{mark.no}번: {mark.picked}번{mark.rarityWeight >= 2.5 ? " · 드문 오답" : ""}</span>)}
        </div>
        <p>드문 오답의 가중치는 선택지별 기록에서 계산하며, 부정행위 확률을 뜻하지 않습니다.</p>
      </details>
      {review && <p className="similarity-review-reason">관리자 확인 사유: {review.reason} · {timeLabel(review.date)}</p>}
      <div className="similarity-review-actions">
        <Button type="button" variant="outline" onClick={() => updateReview(pair, !review)}>
          {review ? "확정 표시 해제" : "추가 근거 확인 후 확정 표시"}
        </Button>
      </div>
    </article>;
  }

  const confirmed = selected?.pairs.filter((pair) => !!reviews[storeKey(selected.summary.key, pair.pairId)]) ?? [];
  const strong = selected?.pairs.filter((pair) => !reviews[storeKey(selected.summary.key, pair.pairId)] && pair.group === "strong") ?? [];
  const suspects = selected?.pairs.filter((pair) => !reviews[storeKey(selected.summary.key, pair.pairId)] && pair.group === "review") ?? [];

  return <>
    <header className="site-header"><div className="container"><h1>숙제 답안 유사도</h1></div></header>
    <main className="container main-content">
      <PageTabs active="similarity" />
      <section className="search-panel similarity-intro">
        <h2>숙제별 공통 오답 분석</h2>
        <p>두 학생이 같은 문항에서 <strong>같은 오답을 선택한 기록</strong>을 비교합니다. 정답만 같은 경우는 의심 근거로 사용하지 않습니다.</p>
        <p>표시되는 결과는 검토 대상이지 부정행위의 증거나 확률이 아닙니다. 시험 난이도, 흔한 오답, 우연, 공동 학습 등을 함께 고려해야 합니다.</p>
        <p className="similarity-storage-note">‘관리자 확정’은 자동 판정이 아니라 수동 검토 기록이며, 현재 브라우저에만 저장됩니다. 다른 기기와 동기화되지 않습니다.</p>
      </section>
      {loading && <div className="initial-empty" role="status">{progress.total ? progress.done + "/" + progress.total + "명 숙제 목록 조회 중…" : "숙제 목록 조회 중…"}</div>}
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && <section className="group">
        <div className="group-heading"><h2>숙제 목록</h2><span>{homeworks.length}개</span></div>
        <div className="cards similarity-homework-list">
          {homeworks.map((homework) => <article className="homework-card" key={homework.key}>
            <div className="card-heading"><h3>{homework.item.title}</h3><span className="status-pill">제출 {homework.submitted}명</span></div>
            <div className="card-meta"><span>{homework.item.q_count ?? "—"}문항</span><span>{homework.item.due_at ? "마감 " + homework.item.due_at : "마감일 정보 없음"}</span></div>
            <Button type="button" variant="outline" className="answer-open" disabled={analyzing} onClick={() => void inspect(homework)}>
              {analyzing ? "분석 중…" : selected?.summary.key === homework.key ? "결과 접기" : "유사 답안 분석"}
            </Button>
            {selected?.summary.key === homework.key && <div className="similarity-results">
              <p className="similarity-result-note">
                {selected.participants}명의 채점 상세 기록 · {selected.reviewedQuestions}문항 비교
                {selected.unavailable > 0 ? " · " + selected.unavailable + "명 조회 실패" : ""}
                {selected.detailCount < homework.submitted ? " · 상세 기록 없는 제출자 제외" : ""}
              </p>
              {([
                { label: "부정행위 확정 (관리자 검토)", rows: confirmed },
                { label: "강한 일치 패턴 (검토 필요)", rows: strong },
                { label: "유사 오답 의심 (검토 필요)", rows: suspects },
              ] as const).map((group) => <section className="similarity-group" key={group.label}>
                <h4>{group.label}<span>{group.rows.length}쌍</span></h4>
                {group.rows.length ? group.rows.map(pairCard) : <p className="similarity-empty">해당하는 학생 쌍이 없습니다.</p>}
              </section>)}
              {selected.pairs.length === 0 && <p className="similarity-result-note">현재 조회된 기록에서 설정된 최소 일치 조건을 만족하는 학생 쌍이 없습니다. 분석되지 않은 기록이 있으면 결과가 달라질 수 있습니다.</p>}
            </div>}
          </article>)}
        </div>
        {!homeworks.length && <div className="empty-card">제출 기록이 있는 숙제가 없습니다.</div>}
      </section>}
      {analyzing && <div className="initial-empty" role="status">{progress.total ? progress.done + "/" + progress.total + "명 채점 기록 비교 중…" : "채점 기록 불러오는 중…"}</div>}
    </main>
  </>;
}
