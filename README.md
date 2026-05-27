# SecondSeat

A second-screen AI companion for gamers — delivers 1–3 line, spoiler-safe micro-hints via voice or text without breaking gameplay flow.

## Prerequisites

- Node.js ≥ 20, npm ≥ 10
- Docker (for infrastructure services)

## Getting Started

### 1. Start infrastructure

```bash
docker-compose up -d   # MongoDB :27017 · Redis :6379 · ChromaDB :8000
```

#### Pull Images if not ready

```bash
docker compose -f docker-compose.yml up -d   # MongoDB :27017 · Redis :6379 · ChromaDB :8000
```

### 2. Configure environment

Each app reads from its own `.env.local`. Copy the example files and fill in secrets:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/inference/.env.example apps/inference/.env.local
cp apps/workers/.env.example apps/workers/.env.local
```

`INFERENCE_SERVICE_SECRET` must be the same value in both `apps/web/.env.local` and `apps/inference/.env.local`.

### 3. Install dependencies

```bash
npm install
```

### 4. Start services

```bash
npm run dev:web        # Next.js on :3000
npm run dev:inference  # Express inference API on :3001
npm run dev:workers    # BullMQ workers + health server on :4100
```

### 5. Seed an admin user (optional)

```bash
npm run seed:privileged   # uses SEED_* vars in apps/web/.env.local
```

## Service Ports

| Service         | Port  | Health endpoint         |
| :-------------- | :---- | :---------------------- |
| Next.js (web)   | 3000  | —                       |
| Inference (API) | 3001  | `GET /health`           |
| Workers         | 4100  | `GET /`                 |
| MongoDB         | 27017 | —                       |
| Redis           | 6379  | —                       |
| ChromaDB        | 8000  | `GET /api/v1/heartbeat` |

> The root `.env.example` has a legacy `INFERENCE_PORT=4000` entry — ignore it. The canonical inference port is **3001**, set via `PORT` in `apps/inference/.env.local`.

## Commands

```bash
# Build
npm run build

# Type-check all workspaces
npm run typecheck

# Test all workspaces
npm run test

# Test a single workspace
npm run test -w apps/inference

# Run a single test file (from inside the workspace directory)
npx vitest run src/services/hint.service.test.ts

# Coverage report
npx vitest --coverage
```
