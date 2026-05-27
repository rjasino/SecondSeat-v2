import Link from "next/link";
import { getSession } from "@/lib/session";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/user.model";
import LogoutButton from "./LogoutButton";

const ROLE_LABELS: Record<string, string> = {
  user: "Player",
  author: "Author",
  admin: "Admin",
};

export default async function NavBar() {
  const session = await getSession();

  let displayName: string | null = null;
  if (session.userId) {
    try {
      await connectDB();
      const user = await UserModel.findById(session.userId)
        .select("name")
        .lean();
      displayName = user?.name ?? null;
    } catch {
      // Graceful degradation: nav still renders without the name
    }
  }

  const isLoggedIn = !!session.userId;
  const isPrivileged = session.role === "author" || session.role === "admin";
  const roleLabel = session.role ? (ROLE_LABELS[session.role] ?? null) : null;

  return (
    <nav
      style={{
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        padding: "10px 2rem",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
      }}
    >
      <Link
        href="/"
        style={{ fontWeight: 700, color: "#fff", marginRight: "auto" }}
      >
        SecondSeat
      </Link>

      {isLoggedIn ? (
        <>
          {isPrivileged && (
            <Link href="/dashboard/ingest" style={{ fontSize: "13px" }}>
              Ingestion
            </Link>
          )}
          {displayName && (
            <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              {displayName}
            </span>
          )}
          {roleLabel && (
            <span
              className={`badge badge--role-${session.role}`}
              style={{ textTransform: "uppercase" }}
            >
              {roleLabel}
            </span>
          )}
          <LogoutButton />
        </>
      ) : (
        <>
          <Link href="/login" style={{ fontSize: "13px" }}>
            Login
          </Link>
          <Link href="/register" style={{ fontSize: "13px" }}>
            Register
          </Link>
        </>
      )}
    </nav>
  );
}
