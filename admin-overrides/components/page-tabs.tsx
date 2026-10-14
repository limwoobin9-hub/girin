"use client";

import { useState } from "react";

type Tab = "home" | "ranking" | "scores" | "answers" | "questions" | "submit";
const tabs: { key: Tab; href: string; label: string }[] = [
  { key: "home", href: "/", label: "문항 분석" },
  { key: "ranking", href: "/ranking", label: "등수·평균" },
  { key: "scores", href: "/scores", label: "전체 성적" },
  { key: "answers", href: "/answers", label: "답지 확인" },
  { key: "questions", href: "/questions", label: "질문·답변" },
  { key: "submit", href: "/submit", label: "숙제 제출" },
];

export function PageTabs({ active }: { active: Tab }) {
  const [pending, setPending] = useState<Tab | null>(null);
  return <nav className="page-tabs" aria-label="학습 현황 메뉴" aria-busy={pending !== null}>
    {tabs.map((tab) => <a key={tab.key} href={tab.href} aria-current={tab.key === active ? "page" : undefined}
      onClick={() => { if (tab.key !== active) setPending(tab.key); }}>
      {pending === tab.key ? "이동 중…" : tab.label}
    </a>)}
  </nav>;
}
