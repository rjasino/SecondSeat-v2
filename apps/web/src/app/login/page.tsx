"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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
          router.push("/dashboard/play");
        }
      } else {
        const data = (await res.json()) as { error: string };
        setError(
          data.error === "invalid_credentials"
            ? "Invalid email or password."
            : "Login failed. Please try again.",
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
        padding: "2rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "360px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <Image
            src="/ss_logo.png"
            alt="SecondSeat"
            width={729}
            height={440}
            priority
            style={{ height: "100px", width: "auto" }}
          />
        </div>

        <div className="card" style={{ padding: "2rem" }}>
          <h1
            style={{
              fontSize: "15px",
              fontWeight: 600,
              marginBottom: "0.35rem",
            }}
          >
            Sign in
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "1.5rem",
              fontFamily: "var(--font-jetbrains), monospace",
            }}
          >
            Welcome back — enter your credentials
          </p>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div>
              <label
                htmlFor="email"
                style={{
                  display: "block",
                  marginBottom: "5px",
                  color: "var(--text-muted)",
                  fontSize: "10px",
                  fontFamily: "var(--font-jetbrains), monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                style={{
                  display: "block",
                  marginBottom: "5px",
                  color: "var(--text-muted)",
                  fontSize: "10px",
                  fontFamily: "var(--font-jetbrains), monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="············"
              />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button
              type="submit"
              className="primary"
              disabled={loading}
              style={{ marginTop: "0.25rem" }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "12px",
            marginTop: "1.25rem",
            fontFamily: "var(--font-jetbrains), monospace",
          }}
        >
          No account?{" "}
          <a href="/register" style={{ color: "var(--accent)" }}>
            Create one
          </a>
        </p>
      </div>
    </div>
  );
}
