import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, readAdminToken } from "@/lib/admin-session";
import { SessionGuard } from "@/components/admin-session-guard";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  if (!await readAdminToken((await cookies()).get(ADMIN_COOKIE)?.value)) redirect("/login");
  return <>
    <SessionGuard />
    <div className="admin-session-bar"><div className="container admin-session-inner">
      <span><span className="admin-session-dot" aria-hidden="true" />관리자 <strong>admin</strong></span>
      <form method="post" action="/api/auth/logout"><button type="submit">로그아웃</button></form>
    </div></div>
    {children}
  </>;
}
