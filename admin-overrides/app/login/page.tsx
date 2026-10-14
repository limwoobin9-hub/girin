import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, readAdminToken, safeReturnTo } from "@/lib/admin-session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "관리자 로그인 | 기린 학습 현황" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeReturnTo((await searchParams).next);
  if (await readAdminToken((await cookies()).get(ADMIN_COOKIE)?.value)) redirect(next);
  return <main className="admin-login-page">
    <section className="admin-login-card" aria-labelledby="login-heading">
      <div className="admin-login-brand"><span className="admin-brand-mark" aria-hidden="true">G</span>기린 학습 현황</div>
      <p className="admin-login-eyebrow">ADMIN</p>
      <h1 id="login-heading">관리자 로그인</h1>
      <p className="admin-login-description">학습 정보를 확인하려면 로그인해 주세요.</p>
      <LoginForm next={next} />
      <p className="admin-login-footnote">관리자 계정만 이용할 수 있습니다.</p>
    </section>
  </main>;
}
