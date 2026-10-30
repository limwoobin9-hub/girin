"use client";
import { useEffect, useMemo, useState } from "react";
import { PageTabs } from "@/components/page-tabs";
import { Input } from "@/components/ui/input";

type Student = { id: string; name: string };
type Directory = { students: Student[] };
const STORE = "girin:student-directory:v1";
const RECENT = "girin:selected-student:v1";

export default function StudentSearchPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const selected = sessionStorage.getItem(RECENT);
      if (selected) setRecent(JSON.parse(selected) as Student);
      const cache = sessionStorage.getItem(STORE);
      if (cache) {
        const value = JSON.parse(cache) as { time: number; students: Student[] };
        if (Date.now() - value.time < 600000 && Array.isArray(value.students)) {
          setStudents(value.students);setLoading(false);return;
        }
      }
    } catch { /* Ignore stale cached data. */ }
    fetch("/api/students", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as Directory & { error?: string };
        if (!response.ok || !Array.isArray(data.students)) throw new Error(data.error ?? "학생 목록을 불러오지 못했습니다.");
        setStudents(data.students);
        try { sessionStorage.setItem(STORE, JSON.stringify({ time: Date.now(), students: data.students })); } catch {}
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "학생 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().normalize("NFC").toLocaleLowerCase("ko-KR");
    if (!term) return [];
    return students.filter((student) => student.name.normalize("NFC").toLocaleLowerCase("ko-KR").includes(term))
      .sort((a,b) => Number(b.name.startsWith(term)) - Number(a.name.startsWith(term)) || a.name.localeCompare(b.name, "ko"))
      .slice(0, 40);
  }, [query, students]);

  function save(student: Student) {
    try { sessionStorage.setItem(RECENT, JSON.stringify(student)); } catch {}
  }
  return <>
    <header className="site-header"><div className="container"><h1>학생 정보 검색</h1><p>학생별 학습 기록을 한곳에서 확인하세요.</p></div></header>
    <main className="container main-content">
      <PageTabs active="home"/>
      <section className="profile-search-hero">
        <div className="profile-hero-copy"><span>STUDENT DIRECTORY</span><h2>어떤 학생을 찾고 있나요?</h2>
          <p>이름 일부만 입력해도 일치하는 학생들이 표시됩니다. 학생을 선택하면 숙제·시험, 성적 추이, 등수와 문항 분석을 한 화면에서 볼 수 있습니다.</p></div>
        <label htmlFor="profile-search" className="profile-search-label">학생 이름</label>
        <Input id="profile-search" value={query} onChange={(event)=>setQuery(event.target.value)}
          placeholder="예: 김, 민수, 김철" autoComplete="off" maxLength={80}/>
        {loading && <p className="profile-hint" role="status">학생 목록을 준비하는 중…</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {!loading && query.trim() && <p className="profile-hint">{filtered.length ? `검색 결과 ${filtered.length}명` : "검색 결과가 없습니다."}{filtered.length===40 ? " · 최대 40명 표시" : ""}</p>}
        {filtered.length>0 && <div className="profile-search-results" role="list">
          {filtered.map((student)=><a role="listitem" className="profile-student-link" key={student.id}
            href={`/student/${encodeURIComponent(student.id)}`} onClick={()=>save(student)}>
            <span className="profile-student-avatar">{student.name.slice(0,1)}</span>
            <span className="profile-student-name"><strong>{student.name}</strong><small>학생 프로필 · 성적과 학습 기록</small></span>
            <span className="profile-student-arrow" aria-hidden="true">→</span>
          </a>)}
        </div>}
      </section>
      {!query.trim() && recent && <section className="profile-recent">
        <h2>최근 확인한 학생</h2>
        <a className="profile-student-link" href={`/student/${encodeURIComponent(recent.id)}`}>
          <span className="profile-student-avatar">{recent.name.slice(0,1)}</span>
          <span className="profile-student-name"><strong>{recent.name}</strong><small>이어서 성적 확인하기</small></span>
          <span className="profile-student-arrow" aria-hidden="true">→</span>
        </a>
      </section>}
    </main>
  </>;
}
