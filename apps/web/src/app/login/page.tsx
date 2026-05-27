"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = (await res.json()) as { role: string };
        if (data.role === "author" || data.role === "admin") {
          router.push("/dashboard/ingest");
        } else {
          router.push("/");
        }
      } else {
        const data = (await res.json()) as { error: string };
        setError(
          data.error === "invalid_credentials"
            ? "Invalid email or password."
            : "Login failed. Please try again."
        );
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: "380px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "1.5rem" }}>
          SecondSeat
        </h1>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label
              htmlFor="email"
              style={{ display: "block", marginBottom: "4px", color: "var(--text-muted)", fontSize: "12px" }}
            >
              EMAIL
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              style={{ display: "block", marginBottom: "4px", color: "var(--text-muted)", fontSize: "12px" }}
            >
              PASSWORD
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            No account?{" "}
            <a href="/register">Create one</a>
          </p>
        </form>
      </div>
    </div>
  );
}
