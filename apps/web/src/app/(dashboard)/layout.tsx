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

  if (session.role !== "admin" && session.role !== "author") {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "18px", marginBottom: "8px" }}>403 Forbidden</h1>
        <p style={{ color: "var(--text-muted)" }}>
          You do not have permission to access this area.
        </p>
      </div>
    );
  }

  return (
    <div>
      <nav
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          padding: "12px 2rem",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
        }}
      >
        <span style={{ fontWeight: 700, color: "#fff", marginRight: "8px" }}>
          SecondSeat
        </span>
        <a href="/dashboard/ingest">Ingestion</a>
        <span style={{ marginLeft: "auto" }}>
          <form action="/api/auth/logout" method="POST" style={{ display: "inline" }}>
            <button type="submit" className="ghost" style={{ fontSize: "12px", padding: "4px 10px" }}>
              Sign out
            </button>
          </form>
        </span>
      </nav>
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem" }}>
        {children}
      </main>
    </div>
  );
}
