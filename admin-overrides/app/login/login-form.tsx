"use client";

import { useState, type FormEvent } from "react";

export function LoginForm({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setError(""); setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ username: fields.get("username"), password: fields.get("password"), next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "로그인하지 못했습니다.");
      window.location.replace(data.redirectTo || "/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "로그인하지 못했습니다.");
      setPending(false);
    }
  }

  return <form onSubmit={submit} className="admin-login-form" aria-busy={pending}>
    <label htmlFor="admin-username">아이디</label>
    <input id="admin-username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="아이디를 입력해 주세요" required maxLength={80} readOnly={pending} />
    <label htmlFor="admin-password">비밀번호</label>
    <input id="admin-password" name="password" type="password" autoComplete="current-password" placeholder="비밀번호를 입력해 주세요" required maxLength={200} readOnly={pending} aria-describedby={error ? "admin-login-error" : undefined} />
    {error && <p className="admin-login-error" id="admin-login-error" role="alert">{error}</p>}
    <button type="submit" disabled={pending}>{pending ? "로그인 중…" : "로그인"}</button>
  </form>;
}
