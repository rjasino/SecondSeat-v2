---
name: security
description: Security standards for SecondSeat — secrets handling, backend hardening, and frontend auth practices
---

## Secrets & Credentials

- Never log passwords, tokens, or PII — not even at debug level.
- Store all secrets in `.env` — never hardcode them in source.
- Never commit `.env` files — maintain a `.env.example` with all keys present but values blank or clearly fake.
- Access env vars only through a validated config module (e.g. `lib/config.ts`) that parses and asserts required variables at startup — fail fast if any are missing rather than silently using `undefined`.
- Never read `.env` directly; you can use `.env.example` as a template for required keys, but the actual `.env` should be kept out of version control and populated with real secrets in each environment.

## Backend Security (`apps/inference`, Express.js)

- Use **`argon2`** for password hashing (`argon2` npm package — winner of the Password Hashing Competition, memory-hard, more resistant to GPU attacks than bcrypt):
  ```ts
  import argon2 from "argon2";
  const hash = await argon2.hash(plainPassword);
  const valid = await argon2.verify(hash, plainPassword);
  ```
- Rate-limit all public endpoints using `express-rate-limit`. Apply a stricter limit to auth routes (`/api/auth/*`) and the generation endpoint (`/api/v1/generate`).
- Use `helmet` middleware on every Express app to set secure HTTP headers.
- Never expose stack traces or internal error details in production responses — the error handler middleware must strip them when `NODE_ENV === 'production'`.
- Return proper HTTP status codes: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `422`, `500`. Never return `200` for an error.
- Validate and sanitize all inputs with Zod at the route boundary — reject requests that fail validation with `422`.
- Authenticate every inference request — the Express service must verify the session cookie or JWT on each call from Next.js.

## Frontend Security (`apps/web`, Next.js)

- **Never store auth tokens or sensitive data in `localStorage` or `sessionStorage`.**
- Use **`iron-session`** for session management — it stores a signed, encrypted session object in an `httpOnly` cookie. Configure flags:
  ```ts
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  }
  ```
- Handle `401` responses globally in a shared fetch wrapper — redirect to the login page without leaking the protected route path in the error.
- Sanitize any user-generated content before rendering — use `DOMPurify` for any HTML that reaches the DOM; prefer rendering as plain text whenever possible.
- Never pass server-side secrets (API keys, DB URIs) to Client Components — keep them in Server Components and Route Handlers only.

## Audio & Privacy

- Voice recording activates **only** on push-to-talk or the `"Hey SS"` wake phrase — never passive background capture.
- Do not persist raw audio — transcription only, discarded after the hint response is returned.
- Local Ollama inference keeps voice and query data on-premise; document this clearly if switching to a hosted LLM.
