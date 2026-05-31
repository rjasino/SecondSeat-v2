# SecondSeat

A second-screen AI companion for gamers — delivers 1–3 line, spoiler-safe micro-hints via voice or text without breaking gameplay flow.

## Prerequisites

- Node.js ≥ 20, npm ≥ 10
- Docker (for infrastructure services)

## Setup

Follow these steps in order to get the project running from scratch.

### 1. Fill in environment files

Copy the example files if you haven't already:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/inference/.env.example apps/inference/.env.local
cp apps/workers/.env.example apps/workers/.env.local
```

Then set the required values in each file:

**`apps/web/.env.local`**

| Variable                   | Value to set                                                                                               |
| :------------------------- | :--------------------------------------------------------------------------------------------------------- |
| `SESSION_PASSWORD`         | Any random string ≥ 32 characters                                                                          |
| `INFERENCE_SERVICE_SECRET` | Any shared secret (must match inference)                                                                   |
| `SEED_ADMIN_EMAIL`         | Email you will use to log in                                                                               |
| `SEED_ADMIN_PASSWORD`      | Password ≥ 12 characters                                                                                   |
| `INGEST_UPLOAD_DIR`        | A writable local path, e.g. `C:\tmp\secondseat-uploads` (Windows) or `/tmp/secondseat-uploads` (Mac/Linux) |

**`apps/inference/.env.local`**

| Variable                   | Value to set                           |
| :------------------------- | :------------------------------------- |
| `INFERENCE_SERVICE_SECRET` | Same value as in `apps/web/.env.local` |
| `LLM_PROVIDER`             | `anthropic`                            |
| `ANTHROPIC_API_KEY`        | Your Anthropic API key                 |

All other values in the example files can remain as-is for a local demo.

### 2. Create the upload directory

```bash
# Windows (PowerShell)
New-Item -ItemType Directory -Force C:\tmp\secondseat-uploads

# Mac / Linux
mkdir -p /tmp/secondseat-uploads
```

### 3. Start infrastructure and services

```bash
docker-compose up -d
npm install
```

Open three terminals and run each service:

```bash
npm run dev:web        # Next.js on :3000
npm run dev:inference  # Inference API on :3001
npm run dev:workers    # BullMQ workers on :4100
```

### 4. Seed admin user and game data

```bash
npm run seed:privileged
```

This creates the admin account you configured in `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and loads the supported game list (Resident Evil 2 Remake, Elden Ring, Valheim).

### 5. Ingest the demo documents

The three documents below are the knowledge base for the demo. Ingest them in order so the panel can ask hint questions about **Resident Evil 2 Remake — Leon A scenario**.

**Log in** at `http://localhost:3000/login` using your admin credentials, then navigate to **Dashboard → Ingest**.

Upload each file using the form:

| File                                       | Game                   | Guide Type |
| :----------------------------------------- | :--------------------- | :--------- |
| `docs/ingestion-docs/leon-a-map.md`        | Resident Evil 2 Remake | Area Guide |
| `docs/ingestion-docs/birkin-g1-knife.md`   | Resident Evil 2 Remake | Boss Guide |
| `docs/ingestion-docs/birkin-g1-run-gun.md` | Resident Evil 2 Remake | Boss Guide |

For each upload:

1. Select the game and guide type from the dropdowns.
2. Click **Choose file** and select the `.md` file from `docs/ingestion-docs/`.
3. Click **Upload for Review** — you will be redirected to the review screen.
4. On the review screen, inspect the extracted content, then click **Approve & Queue**.
5. The workers will begin chunking and embedding. You can watch job progress on the source detail page.

Wait until all three sources show status **completed** before running a demo session.

### 6. Start a hint session

Navigate to **Dashboard → Play**, start a new session, and set your run context (game area, chapter). You are ready to ask for hints.

---

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
