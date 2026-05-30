"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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
        router.push("/dashboard/play");
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
            Create account
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "1.5rem",
              fontFamily: "var(--font-jetbrains), monospace",
            }}
          >
            Free to join — start hinting in seconds
          </p>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div>
              <label
                htmlFor="name"
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
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Your name"
              />
            </div>
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
                Password{" "}
                <span
                  style={{
                    fontWeight: 400,
                    opacity: 0.7,
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  (min 12 chars)
                </span>
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
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
              {loading ? "Creating account…" : "Create account"}
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
          Already have an account?{" "}
          <a href="/login" style={{ color: "var(--accent)" }}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
