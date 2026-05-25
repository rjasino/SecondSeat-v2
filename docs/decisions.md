# Decisions

Architecture and product decisions for SecondSeat, in reverse chronological order. Each entry captures the **context** (why), the **decision** (what), the **alternatives** weighed, and the **consequences** (trade-offs / follow-ups).

---

## 2026-05-26 — Monorepo scaffold with liveness-only health checks

**Context**
The repo had docs (PRD, SDD, data model) but no runnable code. Every subsequent feature — ingestion, inference stream, voice — assumes the npm-workspaces monorepo layout in [docs/sdd.md §6](sdd.md), the security/coding/testing rules in `.claude/rules/`, and shared packages (`@secondseat/db`, `@secondseat/embedding`). Without a scaffold in place first, each new feature would either re-litigate the structure or grow inconsistencies. Spec: [2026-05-26SPEC-monorepo-scaffold-health-checks.md](specs/2026-05-26SPEC-monorepo-scaffold-health-checks.md).

**Decision**
Stand up the full workspace layout — three apps (`web`, `inference`, `workers`) and two shared packages — exposing only liveness health checks. Apply the rule-compliant baseline (helmet, express-rate-limit, centralized error handler, `catchAsync`, Zod validation) on `apps/inference` from the first commit so feature work doesn't retrofit security later. Include `docker-compose.yml` for Mongo + Redis + Chroma, per-app `.env.example`, per-app Zod-validated `lib/config.ts` that fails fast on missing keys, and one Vitest + Supertest smoke test per app. TailwindCSS 4 is configured in `apps/web` with a one-utility-class placeholder so the build pipeline is provably wired.

**Alternatives considered**

- **Skip scaffold, build features ad-hoc.** Rejected — guarantees structural drift and rework, and the workflow's PreToolUse gate already presumes the layout exists.
- **Liveness + readiness (Mongo/Redis/Chroma pings).** Rejected for now — dev infra is often not running; readiness probes would false-alarm and obscure real failures. Add when monitoring is wired.
- **Single `/health` with per-dependency reachability.** Rejected — conflates liveness and readiness semantics in one endpoint, harder to interpret in a future ops dashboard.
- **Minimal Express setup (no helmet/rate-limit yet).** Rejected — security.md/coding.md mandate them; adding them retroactively is exactly the drift this scaffold is meant to prevent.
- **Defer shared packages until a real consumer exists.** Rejected — stubs cost almost nothing and they anchor the import paths every later feature will use.
- **Add Playwright + ESLint/Prettier now.** Rejected — premature before any UI exists. Tailwind is in because SDD §1 names it in the stack; lint/format tooling is not mentioned anywhere and adds maintenance without immediate payoff.

**Consequences**

- All three apps boot independently and respond to a health probe before any feature exists — useful as a sanity check during early development and as a future deploy-readiness baseline.
- Workers process must run a tiny HTTP server (bound to `WORKER_HEALTH_PORT`) purely for the probe; this is dead-weight cycles today but matches the shape any future health/metrics/admin surface will need.
- `express-rate-limit` applies its global default to `/api/v1/health`. A future monitoring integration will need a health-specific bypass — flagged in the spec's Edge Cases.
- Shared packages ship as no-op stubs. First real consumer (likely ingestion) will replace `connect()` and `embed()` with working logic; until then, importing them is safe but produces nothing.
- `.env` is required at startup for every app (Zod fails fast). Developers must copy `.env.example` and fill values before `npm run dev`; this is intentional friction to prevent silent `undefined` propagation.
- No ESLint/Prettier yet — code style is enforced only by `tsc --strict` and review. Revisit if drift becomes painful.
- The Epic I-A/I-B/I-C ingestion work referenced in CLAUDE.md is treated as superseded by this scaffold; re-anchoring it on the new structure is a follow-up spec, not part of this task.
