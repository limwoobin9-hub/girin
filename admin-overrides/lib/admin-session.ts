import { sealData, unsealData } from "iron-session";

export const ADMIN_COOKIE = process.env.NODE_ENV === "production" ? "__Host-girin_admin" : "girin_admin";
export const SESSION_SECONDS = 8 * 60 * 60;
export const ADMIN_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export type AdminSession = { username: "admin"; role: "admin"; version: 1; issuedAt: number; expiresAt: number };

function sessionSecret() {
  const secret = process.env.GIRIN_ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Admin session is not configured");
  return secret;
}

export async function issueAdminSession(): Promise<string> {
  const now = Date.now();
  const session: AdminSession = { username: "admin", role: "admin", version: 1, issuedAt: now, expiresAt: now + SESSION_SECONDS * 1000 };
  return sealData(session, { password: sessionSecret(), ttl: SESSION_SECONDS });
}

export async function readAdminToken(token: string | undefined): Promise<AdminSession | null> {
  if (!token || token.length > 4096) return null;
  try {
    const session = await unsealData<Partial<AdminSession>>(token, { password: sessionSecret(), ttl: SESSION_SECONDS });
    const now = Date.now();
    if (session.username !== "admin" || session.role !== "admin" || session.version !== 1 ||
        typeof session.issuedAt !== "number" || typeof session.expiresAt !== "number" ||
        !Number.isFinite(session.issuedAt) || !Number.isFinite(session.expiresAt) ||
        session.issuedAt > now + 60_000 || session.expiresAt <= now ||
        session.expiresAt - session.issuedAt !== SESSION_SECONDS * 1000) return null;
    return session as AdminSession;
  } catch { return null; }
}

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://girin.local");
    if (url.origin !== "https://girin.local" || !["/", "/ranking", "/scores", "/answers", "/questions", "/submit"].includes(url.pathname)) return "/";
    return `${url.pathname}${url.search}`;
  } catch { return "/"; }
}

