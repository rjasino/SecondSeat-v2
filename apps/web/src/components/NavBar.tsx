import Link from "next/link";
import Image from "next/image";
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

      {isLoggedIn ? (
        <>
          {isPrivileged && (
            <Link href="/dashboard/ingest" style={{ fontSize: "13px" }}>
              Ingestion
            </Link>
          )}
          {!isPrivileged && (
            <Link href="/dashboard/play" style={{ fontSize: "13px" }}>
              Play
            </Link>
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
