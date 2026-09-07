# Job Hunting AI

A local AI-assisted workspace for managing job opportunities, structured role analysis, source-grounded research, versioned application documents, and interview preparation.

## Overview

Job searches scatter context across spreadsheets, notes, browser tabs, and one-off documents. Job Hunting AI brings that workflow into one application: each opportunity has a structured workspace for the job description, status, analysis, research, documents, interviews, and timeline.

The project is a single-user MVP intended for local use. Its main technical focus is controlled AI integration: workflows receive explicit source context, return schema-validated output, record provider usage, and persist results without silently changing factual Candidate or Application data.

## Key capabilities

- **Application workspace** — track opportunities, priority, lifecycle, job descriptions, interviews, and timeline events.
- **Candidate profile** — maintain reusable experience, education, projects, skills, languages, goals, and supporting context.
- **Analyze** — compare a role with approved Candidate evidence, retain immutable run history, and calculate the suggested score in backend code.
- **Research** — collect web-assisted company, role, compensation, and interview evidence with verified source relationships and deterministic confidence rules.
- **Document generation** — create English or French Cover Letters plus Application and Interview Briefs from bounded context.
- **Versioned documents** — edit Markdown, preview it safely, restore history, and regenerate without overwriting earlier versions.
- **Usage controls** — guard and record each provider operation using provider-reported model and token metadata.
- **Responsive Angular UI** — use the core workspace across desktop, tablet, and mobile layouts.

## Architecture

```mermaid
flowchart LR
    UI[Angular web app] --> API[Fastify API]
    API --> APP[Application services]
    APP --> DOMAIN[Domain modules]
    DOMAIN --> REPO[Drizzle repositories]
    REPO --> DB[(PostgreSQL)]

    APP --> ANALYZE[Analyze]
    APP --> RESEARCH[Research]
    APP --> GENERATE[Generation]

    ANALYZE --> TRACKED[Tracked LLM executor]
    RESEARCH --> TRACKED
    GENERATE --> TRACKED
    TRACKED --> PROVIDER[OpenAI Responses adapter]
    PROVIDER --> OPENAI[OpenAI Responses API]

    OPENAI -->|provider-observed web sources| VERIFY[Research provenance projection and validation]
    VERIFY --> RESEARCH
```

HTTP routes validate and map requests, services own workflow decisions, repositories own persistence, and PostgreSQL enforces durable integrity. The AI workflows share a provider-independent tracked executor while keeping prompts, schemas, context selection, and business validation inside their respective
modules.

## AI workflow and trust boundaries

- Analyze, Research, and Generation request strict structured outputs and apply backend runtime validation before domain persistence.
- Provider execution is guarded and usage is recorded before downstream structured parsing can fail.
- Automatic provider retries are disabled, keeping paid execution bounded and observable.
- Research keeps only structured sources that match provider-observed web provenance, then derives normalization, freshness, independence, confidence, and warnings in deterministic code.
- Generation separates Candidate facts, job facts, Analyze interpretation, and admitted Research evidence. Prompts explicitly prohibit manufacturing unsupported Candidate claims.

These controls reduce ambiguity and make failure behavior inspectable; they do not guarantee that model prose is error-free. Generated documents remain user-reviewable, editable artifacts.

See [AI trust boundaries](docs/architecture/ai-boundaries.md) for the complete claim-discipline rules.

## Technology stack

| Area | Technology |
| --- | --- |
| Frontend | Angular 22, TypeScript, Signals, Reactive Forms, RxJS |
| Backend | Fastify 5, TypeScript, Zod |
| Database | PostgreSQL 18 |
| Data access | Drizzle ORM and committed SQL migrations |
| AI integration | Provider abstraction with an OpenAI Responses API adapter |
| Testing | Vitest, Angular testing tools, isolated PostgreSQL integration tests |
| Tooling | pnpm workspaces, ESLint, Docker Compose, GitHub Actions |

## Engineering quality

The repository includes:

- offline API, service, provider-adapter, and frontend tests;
- isolated database integration tests against committed migrations;
- deterministic fake-provider coverage for AI workflows;
- lint and TypeScript checks for both applications;
- production builds with Generation-template packaging verification;
- CI that runs validation without an OpenAI key or provider calls.

## Quick start

Prerequisites:

- Node.js `24.15.0`;
- pnpm `10.32.1`;
- Docker with Compose.

Install dependencies and create local configuration:

```bash
nvm use
pnpm install --frozen-lockfile
cp .env.example .env
export DATABASE_URL=postgresql://job_hunting_ai:job_hunting_ai@localhost:5432/job_hunting_ai
export DATABASE_TEST_URL=postgresql://job_hunting_ai:job_hunting_ai@localhost:5432/job_hunting_ai_test
```

Start PostgreSQL and apply the committed migrations:

```bash
docker compose up -d postgres
pnpm db:migrate
```

Optionally load the synthetic development dataset:

```bash
pnpm db:seed
```

The seed is explicit, repeatable, and limited to its own deterministic sample records. It is not required for an empty real-use workspace.

Start the API and web application:

```bash
pnpm dev
```

The web application runs at `http://localhost:4200`; the API listens on `http://localhost:3000` by default.

Run the standard offline validation:

```bash
pnpm validate
```

Run the isolated PostgreSQL integration suite:

```bash
pnpm test:db
```

`DATABASE_TEST_URL` must identify a separate test database. The test tooling never falls back to `DATABASE_URL` and rejects both variables when they resolve to the same database.

## AI configuration and cost

Real Analyze, Research, and Generation operations require an OpenAI API key and a Responses API model available to that account:

```env
OPENAI_API_KEY=<your-key>
LLM_MODEL=<responses-api-model>
LLM_TIMEOUT_MS=90000
```

These operations may incur provider costs. Normal automated tests and CI use test doubles or injected clients, make no provider calls, and require no API key. Keep secrets only in the Git-ignored root `.env`.

## Security and deployment scope

This MVP is designed for local, single-user use. It does not include authentication or multi-user isolation and should not be exposed directly to the public internet without deployment hardening.

Environment secrets are server-side configuration and must remain outside version control. Before any hosted deployment, add authentication, authorization, transport and network controls, production secret management, rate limiting, monitoring, backups, and an explicit privacy model.

## Documentation

- [Backend architecture](docs/architecture/backend-architecture.md)
- [Frontend architecture](docs/architecture/frontend-architecture.md)
- [Data model](docs/architecture/data-model.md)
- [API contract](docs/architecture/api-contract.md)
- [LLM architecture](docs/architecture/llm-architecture.md)
- [AI trust boundaries](docs/architecture/ai-boundaries.md)
- [Generation contract](docs/architecture/generate-contract.md)

## Project status and scope

The local single-user MVP is complete and prepared for portfolio publication. It includes Application management and the full Analyze, Research, and Generation workflows.

Intentionally deferred:

- authentication and multi-user isolation;
- public deployment hardening;
- notifications and external service integrations;
- additional document export formats;
- asynchronous AI jobs and autonomous application submission.

## Development and authorship

This is a personal portfolio project developed through an AI-assisted engineering workflow, with author-directed product scope, architecture, specifications, validation, and final acceptance.

## License

Licensed under the [MIT License](LICENSE).
