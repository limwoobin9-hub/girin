"use client";

import { useEffect } from "react";

export function SessionGuard() {
  useEffect(() => {
    let checking = false;
    async function check() {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (response.status === 401) window.location.replace("/login");
      } catch { /* A temporary network failure does not invalidate the server session. */ }
      finally { checking = false; }
    }
    function onPageShow(event: PageTransitionEvent) { if (event.persisted) void check(); }
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", onPageShow);
    void check();
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", check); window.removeEventListener("pageshow", onPageShow); };
  }, []);
  return null;
}
