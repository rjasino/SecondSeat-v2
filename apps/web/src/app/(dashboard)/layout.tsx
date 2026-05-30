import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();

  if (!session.userId) {
    redirect("/login");
  }

  const canIngest = session.role === "admin" || session.role === "author";

  return (
    <div>
      <nav
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          padding: "8px 2rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <Link
          href="/"
          aria-label="SecondSeat home"
          style={{
            display: "inline-flex",
            alignItems: "center",
            marginRight: "auto",
          }}
        >
          <Image
            src="/ss_logo.png"
            alt="SecondSeat"
            width={729}
            height={440}
            priority
            style={{ height: "75px", width: "auto" }}
          />
        </Link>
        {canIngest && (
          <Link href="/dashboard/ingest" style={{ fontSize: "13px" }}>
            Ingestion
          </Link>
        )}
        <Link href="/dashboard/play" style={{ fontSize: "13px" }}>
          Play
        </Link>
        <form
          action="/api/auth/logout"
          method="POST"
          style={{ display: "inline-flex" }}
        >
          <button
            type="submit"
            className="ghost"
            style={{ fontSize: "12px", padding: "4px 10px" }}
          >
            Logout
          </button>
        </form>
      </nav>
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem" }}>
        {children}
      </main>
    </div>
  );
}
