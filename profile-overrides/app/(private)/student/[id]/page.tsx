"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PageTabs } from "@/components/page-tabs";
import { Button } from "@/components/ui/button";
import { analyzeQuestions, loadBatches, type QuestionAnalysis } from "@/lib/analysis";
import type { Assessment, Detail } from "@/lib/assessment-data";
import { assessmentKey, compareHomeworkAge, gradeCutoffs, rankAmongParticipants } from "@/lib/ranking";
import { loadProfileRankings, type RankCollection } from "@/lib/profile-rankings";

type Student = { id:string; name:string };
type Profile = { student:Student; items:Assessment[] };
type AnswerView = { detail:Detail|null; questions:QuestionAnalysis[]; submitted:number; eligible:number; detailCount:number; unavailable:number };
const RECENT = "girin:selected-student:v1";

function scoreLabel(value:number|null){return value===null?"미채점":`${value}점`;}
function statusLabel(item:Assessment) {
  if(item.locked)return "공개 전";
  if(item.score!==null)return "채점 완료";
  if(item.submitted_at)return "제출 완료";
  return "미제출";
}
function ExamTrend({items}:{items:Assessment[]}){
  const exams=items.filter(item=>item.kind==="exam" && item.score!==null)
    .sort((a,b)=>(a.open_at??a.due_at??"").localeCompare(b.open_at??b.due_at??"")||a.id-b.id)
    .slice(-12);
  if(!exams.length)return <p className="profile-muted">채점된 시험이 아직 없습니다.</p>;
  const max=Math.max(100,...exams.map(i=>i.score??0));
  const points=exams.map((item,index)=>{
    const x=42+(exams.length===1?260:index*510/(exams.length-1));
    const y=140-(item.score??0)/max*108;
    return {x,y,item};
  });
  const path=points.map((p,i)=>`${i?"L":"M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return <div className="profile-trend">
    <svg viewBox="0 0 600 170" role="img" aria-label={`최근 시험 점수 추이: ${exams.map(i=>i.title+" "+i.score+"점").join(", ")}`}>
      {[0,1,2,3,4].map(i=><g key={i}><line x1="42" x2="580" y1={140-i*27} y2={140-i*27} stroke="#dce6f2" strokeWidth="1" />
        <text x="31" y={144-i*27} textAnchor="end" fontSize="11" fill="#65758b">{Math.round(max*i/4)}</text></g>)}
      {points.length>1&&<path d={path} fill="none" stroke="#4267d5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
      {points.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="5" fill="#4267d5" stroke="white" strokeWidth="2"/>
        <text x={p.x} y={Math.max(12,p.y-11)} fill="#233c72" fontSize="12" fontWeight="700" textAnchor="middle">{p.item.score}</text>
        <text x={p.x} y="158" fill="#66768f" fontSize="10" textAnchor="middle">{i+1}</text></g>)}
    </svg>
    <div className="profile-trend-legend">{exams.map((item,index)=><span key={assessmentKey(item)} title={item.title}>{index+1}. {item.title}</span>)}</div>
  </div>;
}

export default function StudentProfilePage(){
  const {id}=useParams<{id:string}>();
  const [profile,setProfile]=useState<Profile|null>(null);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [expanded,setExpanded]=useState<string|null>(null);
  const [rankings,setRankings]=useState<RankCollection|null>(null);
  const [rankLoading,setRankLoading]=useState(false);
  const [rankProgress,setRankProgress]=useState({done:0,total:0});
  const [answerKey,setAnswerKey]=useState<string|null>(null);
  const [answers,setAnswers]=useState<Record<string,AnswerView>>({});
  const [answerLoading,setAnswerLoading]=useState<string|null>(null);
  const [detailError,setDetailError]=useState("");
  const [showCutoffs,setShowCutoffs]=useState<string|null>(null);

  useEffect(()=>{
    if(!id)return;
    let alive=true;
    setBusy(true);setError("");
    fetch(`/api/profile/${encodeURIComponent(id)}`,{cache:"no-store"})
      .then(async response=>{
        const data=await response.json() as Profile & {error?:string};
        if(!response.ok||!data.student||!Array.isArray(data.items))throw Error(data.error??"프로필을 불러오지 못했습니다.");
        if(!alive)return;
        setProfile(data);
        try{sessionStorage.setItem(RECENT,JSON.stringify(data.student));}catch{}
      })
      .catch(reason=>{if(alive)setError(reason instanceof Error?reason.message:"프로필을 불러오지 못했습니다.");})
      .finally(()=>{if(alive)setBusy(false);});
    return ()=>{alive=false;};
  },[id]);

  const items=profile?.items??[];
  const scored=items.filter(item=>item.score!==null);
  const exams=scored.filter(item=>item.kind==="exam");
  const examAverage=exams.length?exams.reduce((sum,item)=>sum+(item.score??0),0)/exams.length:null;
  const lastExam=[...exams].sort((a,b)=>(b.open_at??b.due_at??"").localeCompare(a.open_at??a.due_at??"")||b.id-a.id)[0];
  const groups=useMemo(()=> (["hw","exam"] as const).map(kind=>({
    kind,items:items.filter(item=>item.kind===kind).sort(compareHomeworkAge)
  })),[items]);

  async function loadRank() {
    if(!profile||rankLoading||rankings)return;
    setRankLoading(true);setDetailError("");
    try {
      const data=await loadProfileRankings(profile.student.name,profile.items,(done,total)=>setRankProgress({done,total}));
      setRankings(data);
    }catch(reason){setDetailError(reason instanceof Error?reason.message:"등수·평균 조회 실패");}
    finally{setRankLoading(false);}
  }
  function openItem(item:Assessment) {
    const key=assessmentKey(item);
    if(expanded===key){setExpanded(null);setAnswerKey(null);return;}
    setExpanded(key);setAnswerKey(null);setDetailError("");
    if(!rankings&&!rankLoading)void loadRank();
  }
  async function openAnswers(item:Assessment){
    if(!profile || !item.submitted_at)return;
    const key=assessmentKey(item);
    if(answerKey===key){setAnswerKey(null);return;}
    setAnswerKey(key);setDetailError("");
    if(answers[key]||answerLoading===key)return;
    setAnswerLoading(key);
    try {
      const [targetResponse,data]=await Promise.all([
        fetch(`/api/analysis/target?name=${encodeURIComponent(profile.student.name)}&id=${item.id}`,{cache:"no-store"}),
        loadBatches("detail",()=>{},key)
      ]);
      const target=await targetResponse.json() as {detail:Detail|null;error?:string};
      if(!targetResponse.ok)throw Error(target.error??"학생의 문항별 답을 불러오지 못했습니다.");
      const relevant=data.rows.filter(row=>row.item&&assessmentKey(row.item)===key);
      setAnswers(previous=>({...previous,[key]:{
        detail:target.detail,questions:analyzeQuestions(item,target.detail,relevant),
        unavailable:data.unavailable,eligible:relevant.length,
        detailCount:relevant.filter(row=>!!row.detail?.marks.length).length,
        submitted:relevant.filter(row=>!!row.item?.submitted_at).length
      }}));
    }catch(reason){setDetailError(reason instanceof Error?reason.message:"문항별 분석 실패");}
    finally{setAnswerLoading(null);}
  }
  return <>
    <header className="site-header"><div className="container"><h1>학생 프로필</h1></div></header>
    <main className="container main-content">
      <PageTabs active="home"/>
      <a className="profile-back" href="/">← 학생 다시 검색</a>
      {busy&&<div className="initial-empty" role="status">학생의 숙제와 시험을 불러오는 중…</div>}
      {error&&<p className="error" role="alert">{error}</p>}
      {profile&&<>
        <section className="profile-identity">
          <span className="profile-identity-avatar">{profile.student.name.slice(0,1)}</span>
          <div><span className="profile-eyebrow">STUDENT PROFILE</span><h2>{profile.student.name}</h2>
            <p>과제 {items.length}개 · 채점 기록 {scored.length}개 · 시험 {groups[1].items.length}개</p>
          </div>
        </section>
        <div className="profile-kpi-grid">
          <div className="profile-kpi"><span>최근 시험</span><strong>{lastExam?scoreLabel(lastExam.score):"—"}</strong><small>{lastExam?.title??"기록 없음"}</small></div>
          <div className="profile-kpi"><span>시험 평균</span><strong>{examAverage===null?"—":examAverage.toFixed(1)+"점"}</strong><small>채점된 시험 {exams.length}개</small></div>
          <div className="profile-kpi"><span>시험 최고 점수</span><strong>{exams.length?Math.max(...exams.map(i=>i.score??0))+"점":"—"}</strong><small>채점된 시험 기준</small></div>
          <div className="profile-kpi"><span>과제 제출</span><strong>{items.filter(i=>i.kind==="hw"&&i.submitted_at).length}/{groups[0].items.length}</strong><small>본인에게 배정된 숙제만</small></div>
        </div>
        <section className="profile-trend-card"><div className="group-heading"><h2>시험 성적 추이</h2><span>최근 최대 12회</span></div><ExamTrend items={items}/></section>
        <div className="profile-shortcuts">
          <a href={`/answers?name=${encodeURIComponent(profile.student.name)}`}>이 학생의 답지 확인 →</a>
          <a href={`/questions?name=${encodeURIComponent(profile.student.name)}`}>이 학생의 질문·답변 →</a>
        </div>
        {rankings?.unavailable ? <p className="ranking-warning">조회에 실패한 학생 {rankings.unavailable}명은 평균과 등수에서 제외한 잠정 결과입니다.</p> : null}
        {detailError&&<p className="error" role="alert">{detailError}</p>}
        {groups.map(({kind,items:groupItems})=><section key={kind} className="group">
          <div className="group-heading"><h2>{kind==="hw"?"숙제":"시험"}</h2><span>{groupItems.length}개</span></div>
          <div className="cards profile-task-list">
            {groupItems.map(item=>{
              const key=assessmentKey(item),isOpen=expanded===key;
              const scoreSet=rankings?.scores[key]??[];
              const stats=item.score===null?null:rankAmongParticipants(item.score,scoreSet);
              const assigned=rankings?.assigned[key]??0,submitted=rankings?.submitted[key]??0;
              const analysis=answers[key];
              return <article className="homework-card profile-task" key={key}>
                <div className="card-heading"><h3>{item.title}</h3><span className={`status-pill ${item.submitted_at?"is-done":""}`}>{statusLabel(item)}</span></div>
                <div className="profile-task-summary"><strong>{scoreLabel(item.score)}</strong><span>{item.q_count??"—"}문항</span>
                  {item.due_at&&<span>마감 {item.due_at.slice(0,10)}</span>}</div>
                <Button type="button" variant="outline" className="answer-open" onClick={()=>openItem(item)} aria-expanded={isOpen}>{isOpen?"상세 접기":"자세히 보기"}</Button>
                {isOpen&&<div className="profile-expanded">
                  {rankLoading&&<p className="profile-muted" role="status">{rankProgress.total?`${rankProgress.done}/${rankProgress.total}명 성적 분석 중…`:"성적 분석을 불러오는 중…"}</p>}
                  {rankings&&<>
                    <div className="ranking-metrics profile-detail-metrics">
                      <div><span>내 점수</span><strong>{scoreLabel(item.score)}</strong></div>
                      <div><span>참여 학생 평균</span><strong>{stats?stats.average.toFixed(1)+"점":"—"}</strong></div>
                      <div><span>등수</span><strong>{stats?`${stats.rank}등 / ${stats.count}명`:"—"}</strong></div>
                      <div><span>상위 비율</span><strong>{stats?stats.topPercent.toFixed(1)+"%":"—"}</strong></div>
                      {kind==="hw"&&<div><span>배정 학생 기준 제출률</span><strong>{assigned?(submitted/assigned*100).toFixed(1)+"%":"—"}</strong>
                        <small className="metric-detail">{submitted}/{assigned}명</small></div>}
                    </div>
                    <div className="grade-row"><span>9등급 기준 <b>{stats?stats.grade9+"등급":"—"}</b></span>
                      <span>5등급 기준 <b>{stats?stats.grade5+"등급":"—"}</b></span></div>
                    {stats&&<><button type="button" className="cut-toggle" aria-expanded={showCutoffs===key}
                      onClick={()=>setShowCutoffs(showCutoffs===key?null:key)}>{showCutoffs===key?"등급 컷 접기":"등급 컷 보기"}</button>
                      {showCutoffs===key&&<div className="cutoff-panel"><p className="cutoff-description">채점된 학생 기준 예상 등급 컷</p>
                        <div className="cutoff-grid">{([5,9] as const).map(system=><section className="cutoff-system" key={system}>
                          <h4>{system}등급제</h4><div className="cutoff-list">{gradeCutoffs(scoreSet,system).map(band=><div className="cutoff-row" key={band.grade}>
                            <span>{band.grade}등급</span><strong>{band.minimum===null?"—":band.minimum+"점"}</strong><small>{band.students}명</small>
                          </div>)}</div></section>)}</div>
                      </div>}</>}
                  </>}
                  {item.submitted_at&&!item.locked&&<>
                    <div className="profile-answers-action">
                      <Button type="button" variant="outline" onClick={()=>void openAnswers(item)} disabled={answerLoading!==null}>
                        {answerLoading===key?"문항 분석 중…":answerKey===key?"선택 답안 접기":"선택 답안 · 정답률 보기"}
                      </Button>
                    </div>
                    {answerKey===key&&analysis&&<>
                      <div className="analysis-panel" aria-live="polite">
              <div className="analysis-summary"><strong>{analysis.questions.filter((q) => q.ok === false).length}개 오답</strong><span>제출 {analysis.submitted}/{analysis.eligible}명</span><span>문항 기록 {analysis.detailCount}명</span></div>
              {analysis.unavailable > 0 && <p className="analysis-note">{analysis.unavailable}명 목록을 확인하지 못해 아래 비율은 조회된 기록 기준입니다.</p>}
              {analysis.detailCount < analysis.submitted && <p className="analysis-note">제출자 {analysis.submitted - analysis.detailCount}명의 문항 기록은 읽지 못해 정답률에서 제외했습니다.</p>}
              {!analysis.detail && <p className="analysis-note">이 계정의 문항별 제출 기록을 확인할 수 없습니다.</p>}
              <div className="choice-legend" aria-label="선택지 색상 안내">
                <span><i className="legend-swatch is-answer" />정답</span>
                <span><i className="legend-swatch is-wrong-pick" />내가 고른 오답</span>
              </div>
              <div className="question-list">{analysis.questions.map((q) => {
                const pickedChoices = new Set((q.picked ?? "").split(",").filter(Boolean));
                const answerChoices = new Set((q.answer ?? "").split(",").filter(Boolean));
                const circledChoices = ["①", "②", "③", "④", "⑤"];
                return <div className={`question-line ${q.ok === false ? "is-wrong" : ""}`} key={q.no}>
                  <strong className="question-number">{q.no}번</strong>
                  <div className="question-content">
                    <div className="question-choices" aria-label={`${q.no}번 선택지`}>
                      {circledChoices.map((label, index) => {
                        const value = String(index + 1);
                        const isPicked = pickedChoices.has(value);
                        const isAnswer = answerChoices.has(value);
                        const isWrongPick = isPicked && q.ok === false && !isAnswer;
                        return <span
                          className={`choice-chip ${isAnswer ? "is-answer" : ""} ${isWrongPick ? "is-wrong-pick" : ""}`}
                          key={value}
                          title={isWrongPick ? "내가 고른 오답" : isAnswer ? "정답" : undefined}
                        >{label}</span>;
                      })}
                    </div>
                    <div className="question-meta">
                      <span className="question-outcome">{q.ok === true ? "정답" : q.ok === false ? "오답" : "기록 없음"}</span>
                    </div>
                  </div>
                  <div className="question-error-rate">
                    <span>정답률</span>
                    <b>{q.assessed ? `${((q.assessed - q.wrong) / q.assessed * 100).toFixed(1)}%` : "—"}</b>
                  </div>
                </div>;
              })}</div>
              {!analysis.questions.length && <p className="analysis-note">문항 기록이 없습니다.</p>}
                      </div>
                    </>}
                  </>}
                  {!item.submitted_at&&<p className="profile-muted">아직 제출하지 않은 과제입니다. 제출한 뒤 문항별 답안이 표시됩니다.</p>}
                </div>}
              </article>;
            })}
            {!groupItems.length&&<div className="empty-card">이 학생에게 배정된 {kind==="hw"?"숙제":"시험"}이 없습니다.</div>}
          </div>
        </section>)}
        <p className="method-note">등수·평균·등급은 동일한 과제가 배정되어 채점된 학생 기준이며, 일부 기록을 읽지 못한 경우 잠정값입니다. 시험 추이는 점수 기록을 기준으로 표시합니다.</p>
      </>}
    </main>
  </>;
}
