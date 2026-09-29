# MyWallet - Production-Ready Personal Expense Tracker API with Chatbot Analyst

This is MyWallet, a self-hosted personal finance tracker with a built-in AI analyst. Log expenses and recurring income, visualize monthly spending, and ask a locally hosted language model questions about your own data, with deterministic, fully tested numbers underneath.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D20-339933.svg)](https://nodejs.org)
[![Build Status](https://img.shields.io/github/actions/workflow/status/ESPChong/mywallet-expense-tracker-api-ai-chatbot/ci.yml)](https://github.com/ESPChong/mywallet-expense-tracker-api-ai-chatbot/actions)

## Table of Contents

- [Live Demo](#live-demo)
- [Screenshots](#screenshots)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables Reference](#environment-variables-reference)
- [Scripts Reference](#scripts-reference)
- [Testing, Linting, and Type Checking](#testing-linting-and-type-checking)
- [API Documentation](#api-documentation)
- [Deployment and Operations](#deployment-and-operations)
- [Roadmap](#roadmap)
- [License](#license)

## Live Demo

- Production: (not yet deployed)
- Staging: (not yet deployed)
- API documentation (Swagger UI): served by the app at `/docs` (for example, `http://localhost:3000/docs` in development)
- Demo account credentials: (placeholder)

## Screenshots

### Dashboard

<img src="docs/screenshots/dashboard.png" alt="Dashboard Screenshot" width="70%" />

### Expenses

<img src="docs/screenshots/expenses.png" alt="Expenses Screenshot" width="70%" />

### Incomes and Categories

<img src="docs/screenshots/incomes.png" alt="Incomes Screenshot" width="70%" />
<img src="docs/screenshots/categories.png" alt="Categories Screenshot" width="70%" />

### AI Analyst

<img src="docs/screenshots/chatbot.png" alt="Chatbot Screenshot" width="70%" />

### Demo Video

_Placeholder: link to a short walkthrough covering registration, adding an expense,
and asking the analyst a question._

## Features

- **Session-based authentication.** HTTP-only cookies, bcrypt password hashing, and
  server-side session records stored as SHA-256 hashes. Login and registration are
  rate limited per email and per IP, with optional Redis-backed shared counters.
- **Expense tracking.** Full CRUD with pagination, month and category filters, and
  strict per-user ownership isolation on every query.
- **Recurring income.** Income templates post automatically each month. Postings never
  predate a template's creation, missing periods are back-filled, and the dashboard
  read endpoint is a pure read with no side effects.
- **Dashboard analytics.** Monthly summary (income, expenses, net, all-time savings),
  spending breakdown by category, recent activity, and run-rate month-end projections
  with confidence grading.
- **AI analyst.** A locally hosted model (Ollama) answers questions about your data
  using a hybrid design: a pre-computed context snapshot plus whitelisted, user-scoped
  tools. All amounts are pre-converted before the model sees them, and if the model
  server is unreachable the endpoint degrades to a deterministic summary instead of
  failing. Daily per-user message limit.
- **Money handling.** All amounts are stored as integer minor units (cents). Display
  currency is configurable and defaults to HKD.
- **Dark and light themes**, responsive layout, and empty, loading, and error states
  throughout.
- **A documented REST API** (OpenAPI 3.0) and a deterministic test suite requiring no
  network access and no running language model.

## Tech Stack

| Layer         | Technology                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend      | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query, react-hook-form with zod resolvers, Recharts, next-themes, sonner |
| Backend       | Next.js Route Handlers (REST), zod request validation, custom session authentication                                                                         |
| Database      | MongoDB with Prisma ORM                                                                                                                                      |
| Rate limiting | Optional Redis (ioredis) shared counters; in-memory per-process fallback                                                                                     |
| AI / LLM      | LangChain core primitives with a custom ReAct tool loop, Ollama for local inference (default model: qwen2.5:7b-instruct)                                     |
| Testing       | Vitest, mongodb-memory-server (in-memory replica set), Playwright (end-to-end)                                                                               |
| Code quality  | ESLint 9 (flat config), Prettier, Husky with lint-staged pre-commit hooks                                                                                    |

### Key Design Decisions

- **Money as integer minor units, everywhere.** No floating-point amounts are ever
  persisted. Conversion to display strings happens exactly once, at the boundary
  (UI formatters, and the chatbot context builder so the model only ever sees
  pre-converted figures it can quote verbatim).
- **Deterministic math, language-shaped output.** Totals, projections, and percentage
  splits are computed in TypeScript. The language model selects tools and phrases
  answers; it never performs arithmetic that users rely on.
- **GET endpoints are pure reads.** Recurring income postings are materialized on
  login and on expense/income mutations, never during dashboard reads.
- **Graceful degradation.** If the model server is down, the chatbot endpoint returns
  a deterministic summary built from live data with an explicit `mode` field, rather
  than an error. If Redis is down, rate limiting fails open rather than taking the
  app with it.

## Getting Started

### Prerequisites

- **Node.js 20 or later** (with npm).
- **MongoDB 6.0 or later**, running as a **replica set**. This is required because user
  registration uses Prisma transactions, which MongoDB only supports on replica sets.
  A single-node replica set is sufficient. MongoDB Atlas clusters qualify out of the
  box. For a local standalone instance, enable replication and initiate it once:

  ```js
  // mongosh, after adding replication.replSetName to your mongod config and restarting
  rs.initiate();
  ```

- **Redis (optional)** for shared rate-limit counters. Without it, rate limits are
  enforced in-memory per process, which is fine for single-instance deployments.
  On macOS: `brew install redis && brew services start redis`.
- **Ollama (optional)** for the AI analyst. Recommended model: `qwen2.5:7b-instruct`
  (about 5 GB on disk; 16 GB of RAM recommended). Without Ollama, the application runs
  normally and the chatbot operates in offline summary mode.

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ESPChong/mywallet-expense-tracker-api-ai-chatbot.git
cd expense-tracker

# 2. Install dependencies (prisma generate runs automatically via postinstall)
npm install

# 3. Create your environment file
cp .env.example .env

# 4. Apply the database schema (collections and unique indexes)
npm run db:push

# 5. (Optional) Load demo data
npm run db:reset:seed
#    Demo login: dev@example.com / devpassword123 (dev-only credentials)

# 6. (Optional) Enable Redis-backed rate limiting
#    Start Redis, then uncomment REDIS_URL in .env and restart the dev server

# 7. (Optional, for the AI analyst) Start Ollama and pull the model
ollama pull qwen2.5:7b-instruct
ollama serve

# 8. Start the development server
npm run dev
```

The app is now running at `http://localhost:3000`. Register an account (or use the
seeded demo account) to begin. The interactive API documentation is available at
`http://localhost:3000/docs`.

## Environment Variables Reference

| Variable                 | Required | Scope                | Default                  | Description                                                                                                                                      |
| ------------------------ | -------- | -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`           | Yes      | Local and production | none                     | MongoDB connection string. Must point to a replica set.                                                                                          |
| `REDIS_URL`              | No       | Local and production | unset                    | When set, rate-limit counters are shared across processes and survive restarts (Redis via ioredis); otherwise in-memory per process. Fails open. |
| `NEXT_PUBLIC_CURRENCY`   | No       | Local and production | `HKD`                    | ISO 4217 currency code used for all display formatting and the chatbot context.                                                                  |
| `OLLAMA_BASE_URL`        | No       | Local                | `http://localhost:11434` | Base URL of the Ollama server.                                                                                                                   |
| `CHATBOT_MODEL`          | No       | Local                | `qwen2.5:7b-instruct`    | Model name passed to Ollama.                                                                                                                     |
| `CHATBOT_LLM_DISABLED`   | No       | Local and test       | unset                    | Set to `true` to force the chatbot into offline summary mode without stopping the model server.                                                  |
| `CHATBOT_DAILY_LIMIT`    | No       | Local and production | `50`                     | Chatbot messages per user per UTC day.                                                                                                           |
| `LOGIN_RATE_LIMIT_EMAIL` | No       | Local and production | `10`                     | Failed login attempts per email per 15-minute window.                                                                                            |
| `LOGIN_RATE_LIMIT_IP`    | No       | Local and production | `30`                     | Login attempts per IP per 15-minute window.                                                                                                      |
| `REGISTER_RATE_LIMIT_IP` | No       | Local and production | `10`                     | Registrations per IP per 15-minute window.                                                                                                       |

Example `.env`:

```bash
# Required
DATABASE_URL="mongodb://localhost:27017/expense-tracker?replicaSet=rs0&directConnection=true"

# Optional: shared rate limit counter
# REDIS_URL="redis://localhost:6379"

# Optional: AI analyst
OLLAMA_BASE_URL="http://localhost:11434"
CHATBOT_MODEL="qwen2.5:7b-instruct"
# CHATBOT_LLM_DISABLED="true"

# Optional: rate limits (defaults shown)
# CHATBOT_DAILY_LIMIT=50
# LOGIN_RATE_LIMIT_EMAIL=10
# LOGIN_RATE_LIMIT_IP=30
# REGISTER_RATE_LIMIT_IP=10

# Optional: display currency (ISO 4217)
# NEXT_PUBLIC_CURRENCY=HKD
```

Notes:

- Never commit `.env`. Real secrets belong only in your hosting platform's
  environment configuration.
- The test suite reads none of your runtime infrastructure from `.env`: tests boot an
  in-memory MongoDB replica set (and refuse to run against any other target), and
  both tests and E2E always run on the in-memory rate limiter regardless of
  `REDIS_URL`, keeping them hermetic.

## Scripts Reference

| Command                                          | Description                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `npm run dev`                                    | Start the development server                                        |
| `npm run build`                                  | Create a production build                                           |
| `npm run start`                                  | Serve the production build                                          |
| `npm test`                                       | Run the full test suite (Vitest)                                    |
| `npx vitest`                                     | Run tests in watch mode                                             |
| `npx tsc --noEmit`                               | Type-check the project without emitting output                      |
| `npm run lint`                                   | Run ESLint                                                          |
| `npm run format`                                 | Run Prettier over the repository                                    |
| `npm run db:push`                                | Apply the Prisma schema (collections and indexes) to `DATABASE_URL` |
| `npm run db:reset`                               | Destructive: wipe all data (guarded by an interactive confirmation) |
| `npm run db:reset:seed`                          | Wipe and seed demo data                                             |
| `npm run e2e`                                    | End-to-end tests (self-contained stack)                             |
| `npm run e2e:ui`                                 | End-to-end tests in the interactive Playwright UI                   |
| `npm run e2e:report`                             | Show the HTML report of the last E2E run                            |
| `npx tsx scripts/cleanup-retroactive-entries.ts` | Maintenance: remove income postings that predate their template     |

Pre-commit hooks (Husky with lint-staged) run ESLint and Prettier on staged files.

## Testing, Linting, and Type Checking

### Unit and Integration Tests

```bash
npm test
```

The suite runs against an in-memory MongoDB replica set (mongodb-memory-server) with
the Prisma schema pushed before collection, so unique constraints and index-dependent
code paths execute for real. Test files run sequentially because they share one
in-memory database. The first run downloads a MongoDB binary (about 70 MB).

What is covered:

- Authentication: registration (default categories, password hashing, duplicate
  emails), login (case-insensitive email, invalid credentials), logout, session
  lifecycle, and rate limiting on login and registration.
- CRUD and ownership isolation: expenses, incomes, and categories, including
  cross-user access returning 404 and invalid references returning 400.
- Recurring income engine: idempotent posting, the creation-boundary guard (no
  postings before a template existed), back-fill behavior, and the pure-read
  guarantee of the dashboard endpoint.
- Dashboard aggregation: summary totals, category breakdown, activity ordering,
  and projection math with a fixed clock.
- Chatbot: request validation, rate limiting, context assembly, projection,
  tool execution, and the full agent tool loop using a scripted model (no real
  language model is contacted in tests), plus the offline fallback path.

### End-to-End Tests

End-to-end tests run a real browser against the full stack: an ephemeral in-memory
MongoDB, the real Next.js server, and the real frontend. No Ollama is required (the
chatbot is tested in offline mode); no local database or seeded data is needed. The
suite is fully self-contained, and identical locally and in CI.

```bash
npx playwright install chromium    # once, for browser binaries
npm run e2e                        # headless run
npm run e2e:ui                     # interactive Playwright UI
npm run e2e:report                 # open the HTML report of the last run
```

Covered: registration and the auth gate, login error handling, expense CRUD through
the UI (including dashboard updates), recurring income creation with the active
toggle, and the chatbot drawer's offline summary path.

### Linting and Formatting

```bash
npm run lint
npm run format
```

## API Documentation

The complete REST contract, including request and response schemas, error envelopes,
rate-limit behavior, and the chatbot request and response shapes, is specified in the
OpenAPI 3.0 specification (`swagger.yaml`) in the `/docs` folder at the repository
root. The running app renders it as interactive Swagger UI at `/docs`.

Endpoint summary:

| Method             | Path                 | Purpose                                               |
| ------------------ | -------------------- | ----------------------------------------------------- |
| POST               | `/api/auth/register` | Create account (seeds 9 default categories)           |
| POST               | `/api/auth/login`    | Establish a session                                   |
| POST               | `/api/auth/logout`   | Terminate the session (idempotent)                    |
| GET                | `/api/me`            | Current user                                          |
| GET, POST          | `/api/expenses`      | List (paginated, filtered) and create expenses        |
| GET, PATCH, DELETE | `/api/expenses/{id}` | Read, update, delete an expense                       |
| GET, POST          | `/api/incomes`       | List and create recurring income templates            |
| GET, PATCH, DELETE | `/api/incomes/{id}`  | Read, update (including soft stop), delete a template |
| GET, POST          | `/api/categories`    | List and create categories                            |
| GET                | `/api/dashboard`     | Monthly analytics (pure read)                         |
| POST               | `/api/chatbot`       | Ask the AI analyst                                    |
| GET                | `/api/health`        | Health check (unauthenticated)                        |

Conventions: all amounts are integer minor units; a 404 means "not found or not
owned by you"; every error uses the envelope `{ success: false, error, details? }`.

## Deployment and Operations

### Building for Production

```bash
npm run build
npm run start        # serves the production build; NODE_ENV=production enables secure cookies
```

Apply the schema to the production database before the first start:

```bash
DATABASE_URL="<production-url>" npx prisma db push
```

### Production Considerations

- **Rate limiting is Redis-backed when `REDIS_URL` is set.** Counters are shared
  across processes and survive restarts; a Redis outage fails open (limits become
  permissive) rather than taking the app down. Without `REDIS_URL`, limits are
  enforced in-memory per process, which suits single-instance deployments.
- **The default model is local-only.** Serverless platforms cannot run Ollama. The
  model is created in a single factory function (`createDefaultModel` in
  `src/services/chatbotService.ts`); swap it there for a hosted provider without
  touching any other code. Without a model, the chatbot degrades to offline mode
  and remains functional.
- **Session cleanup is lazy.** Expired sessions are removed when encountered or on
  login. For long-lived deployments, consider a TTL index on `Session.expiresAt`.

### Docker

Requires a running MongoDB replica set (see Docker Compose below for one).

```bash
docker build -t expense-tracker .
docker run -p 3001:3000 \
  -e DATABASE_URL="mongodb://host:27017/expense-tracker?replicaSet=rs0&directConnection=true" \
  expense-tracker
```

The image runs as a non-root user. The entrypoint applies the Prisma schema
(idempotent, retried while the database elects a primary), then serves the
production build on port 3001. The container health check polls `GET /api/health`.

### Docker Compose

```bash
docker compose up -d --build          # app + MongoDB + Redis
docker compose --profile ai up -d     # also Ollama (~5 GB pull, once)
```

The `db` service is a single-node replica set (required for Prisma transactions);
`redis` backs the shared rate-limit counters; data persists in the `db-data` volume.
All services except the app's published port are internal to the compose network.
Without the `ai` profile, the chatbot operates in offline summary mode.

### CI/CD

CI runs on every push to `main` and every pull request:

#### GitHub Actions

1. **quality** — ESLint, `tsc --noEmit`, the full Vitest suite (ephemeral in-memory
   MongoDB), and a production build.
2. **e2e** — the Playwright suite against a self-contained stack; the HTML report
   is uploaded as an artifact on failure.
3. **docker-build** — builds the image to validate the Dockerfile.

#### Quality Gates

All three jobs must pass before merge. MongoDB binaries for the memory server are
cached between runs.

### Database Migrations in Production

Schema changes are applied by the container entrypoint via idempotent
`prisma db push`, retried until the database is available. For a strict migration
history with reviewable, ordered changes, adopt `prisma migrate` instead.

### Health Checks

#### `/api/health`

`GET /api/health` — unauthenticated, never rate limited:

```json
{
  "status": "ok",
  "checks": { "database": "up", "redis": "up", "chatbot": "up" },
  "timestamp": "2025-06-18T12:00:00.000Z"
}
```

`status` is `ok` (200) only when the database responds. `redis` and `chatbot` are
informational: a `down` or `disabled` value degrades a feature (fail-open rate
limiting; offline analyst) without failing the probe. Used by the Docker
`HEALTHCHECK` and as the Playwright web-server readiness gate. A `503` with
`database: "down"` means the container should be restarted or the database
investigated.

### Staging Environment

(Not yet implemented.)

## Roadmap

- Budgets per category, surfaced to the AI analyst for over-budget analysis
- Chat history persistence across sessions
- Streaming chatbot replies
- VPS deployment guide with Caddy reverse proxy and automated HTTPS
- Hosted-model deployment path for serverless environments
- Session expiry via MongoDB TTL index
- Category update and delete with expense reassignment
- Per-user currency setting

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for
details.
