"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (res.ok) {
        router.push("/");
      } else {
        const data = (await res.json()) as { error: string };
        if (data.error === "email_already_registered") {
          setError("An account with that email already exists.");
        } else if (data.error === "validation_error") {
          setError("Please check your input and try again.");
        } else {
          setError("Registration failed. Please try again.");
        }
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
          Create account
        </h1>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div>
            <label
              htmlFor="name"
              style={{
                display: "block",
                marginBottom: "4px",
                color: "var(--text-muted)",
                fontSize: "12px",
              }}
            >
              NAME
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              style={{
                display: "block",
                marginBottom: "4px",
                color: "var(--text-muted)",
                fontSize: "12px",
              }}
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
              style={{
                display: "block",
                marginBottom: "4px",
                color: "var(--text-muted)",
                fontSize: "12px",
              }}
            >
              PASSWORD{" "}
              <span style={{ fontWeight: 400 }}>(min 12 characters)</span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            Already have an account?{" "}
            <a href="/login">Sign in</a>
          </p>
        </form>
      </div>
    </div>
  );
}
