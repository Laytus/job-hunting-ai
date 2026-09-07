# Backend architecture

## Purpose

The Job Hunting AI backend is a Fastify and TypeScript application organized
around explicit feature boundaries. It serves the local Angular client,
coordinates the Analyze, Research, and Generation workflows, and persists
domain state in PostgreSQL through Drizzle ORM.

The architecture separates HTTP validation, application decisions, persistence,
and provider integration so each boundary can be tested independently.

## Architectural principles

- **Vertical slices:** each feature owns its routes, schemas, services,
  repositories, types, errors, and tests.
- **Thin HTTP boundary:** routes validate transport input, invoke one service
  operation, map errors, and serialize safe responses.
- **Service-owned workflows:** services enforce business rules and coordinate
  repositories, deterministic processors, and external execution.
- **Repository-owned persistence:** SQL and transaction details remain outside
  routes and workflow logic.
- **Explicit AI boundary:** workflows depend on a generic tracked LLM executor,
  not directly on the OpenAI SDK.
- **Fail-closed behavior:** invalid context, unverified evidence, unusable model
  output, and failed persistence never become successful domain results.

## Module boundaries

```text
apps/api/src/
├── candidate/           Candidate aggregate and replacement workflow
├── application/         Opportunity lifecycle and metadata
├── job-description/     Application-owned role context
├── interview/           Interview schedule, notes, and feedback
├── application-event/   Immutable timeline records
├── document/            Markdown documents and append-only versions
├── analyze/             Candidate-to-role analysis
├── research/            Verified Research evidence graphs
├── generation/          Cover Letters and preparation briefs
├── llm/                 Provider abstraction and usage tracking
├── db/                  Drizzle schema and database composition
└── http/                Shared HTTP error and date handling
```

Cross-feature composition occurs in the application bootstrap. Provider-backed
services and executors are resolved lazily, so API startup and ordinary read
routes do not require OpenAI configuration.

## Request flow

The standard request path is:

```text
Fastify route
    → JSON Schema validation
    → feature service
    → repository
    → Drizzle
    → PostgreSQL
```

Fastify is configured not to coerce types or remove unknown fields. Feature
schemas therefore define the accepted API shape rather than silently repairing
client input.

Service errors are mapped to the shared safe API envelope. Cross-Application
child lookups use not-found behavior rather than revealing foreign resource
existence.

See [API contract](api-contract.md) for the resource surface.

## Persistence

PostgreSQL is the durable integrity boundary. Drizzle defines the typed schema,
and committed forward-only SQL migrations reproduce it on an empty database.

Important persistence rules include:

- a single Job Description per Application;
- at most one active `RUNNING` Analyze or Research row per Application through
  partial unique indexes;
- Application-owned cascade cleanup for histories and Research graphs;
- claim/source ownership enforced with composite foreign keys;
- exactly one Candidate or Application owner for each Document;
- immutable DocumentVersion content with an atomically advanced current-version
  pointer.

Document creation and version updates are transactional. Research completion
atomically writes the validated sources, claims, evidence relationships, and
terminal run state. External provider execution never occurs inside a database
transaction.

See [data model](data-model.md) for the entity and constraint design.

## Analyze workflow

Analyze compares approved Candidate evidence with one Application and its Job
Description.

```text
source preflight
    → create RUNNING JobAnalysis
    → build bounded context and versioned prompt
    → one tracked structured provider call
    → JSON and Zod validation
    → deterministic backend scoring
    → persist COMPLETED or FAILED run
```

The context builder excludes prior analyses, Research, generated documents,
usage metadata, interview notes, and other non-source fields. Candidate goals
and preferences may guide interpretation but are not evidence of demonstrated
experience.

Analyze history is immutable. Reruns append records, and Analyze never changes
Application priority.

## Research workflow

Research creates an Application-owned evidence graph from approved Application
and Job Description context.

```text
source preflight
    → create RUNNING Research
    → one tracked structured call with web_search
    → project proposed sources to provider-observed URLs
    → normalize, deduplicate, and validate the graph
    → derive freshness, independence, confidence, and warnings
    → atomically persist the completed graph
```

The model proposes sources, claims, evidence relationships, evidence types, and
source classifications. It does not decide final confidence.

The projection boundary keeps only valid structured sources that exactly match
provider-observed provenance after conservative URL normalization. Relationships
to discarded sources, unsupported claims, and orphan sources are removed. The
strict graph validator then rechecks ownership and provenance, rejects malformed
structured URLs or invalid values, and derives backend-owned confidence.

Compensation remains structured and unconverted. Exact and range amounts are
validated without currency conversion or annualization. Dynamic claim
freshness uses UTC calendar dates relative to the persisted Research date.

Research may complete successfully with an empty verified graph. This preserves
the distinction between “no defensible finding” and an execution failure.

## Generation workflow

Generation creates:

- English or French Cover Letters with explicit market and sector profiles;
- English Application Briefs;
- English Interview Briefs.

The service loads the required Application, Job Description, and Candidate,
then optionally selects the latest completed Analyze and Research results.
Document-specific context builders whitelist the material each output may use.

Each operation performs one tracked structured provider call without web
search, validates the response, and passes bounded prose fields to a
deterministic Markdown composer. Generate creates a Document and initial
DocumentVersion; Regenerate appends a version without using prior edited
content as factual context.

The service prevents known duplicate logical documents and uses in-process
single-flight protection for concurrent generation of the same target. The
generic Document table does not currently enforce a database uniqueness
constraint on `(application_id, type)`, so distributed multi-process generation
would require an additional database-backed concurrency design.

See [Generation contract](generate-contract.md) for active versions, context
rules, and output shapes.

## AI execution and usage tracking

Analyze, Research, and Generation share this boundary:

```text
workflow
    → AiUsageGuard
    → TrackedLlmExecutor
    → LlmProvider
    → OpenAI Responses adapter
    → AiUsageRecorder
    → workflow-owned parsing and validation
```

The guard fails closed if usage state cannot be verified. The recorder stores
provider-reported operation, resolved model, input tokens, output tokens, total
tokens, and timestamp. It does not store prompts, responses, secrets, prices,
or estimated cost.

Usage is recorded before downstream structured parsing, validation,
composition, or domain persistence. Billable execution therefore remains
auditable even if a later boundary rejects the result.

The OpenAI adapter disables automatic retries. Automated tests use
`FakeLlmProvider` or an injected client seam and do not call the provider.

See [LLM architecture](llm-architecture.md) and
[AI trust boundaries](ai-boundaries.md) for the shared provider and grounding
contracts.

## Error and failure boundaries

- Required-source failures stop before provider execution.
- Active-run conflicts are rejected before a second workflow starts.
- Provider, timeout, structured-output, provenance, and validation failures are
  represented by stable workflow errors.
- Analyze and Research attempt safe terminal failure transitions after an
  accepted run fails.
- Composition failures do not persist partial generated Markdown.
- Transaction failures do not expose partial graph or Document state.
- Error responses omit provider payloads and internal diagnostics.

The workflows are synchronous. There are no background jobs, automatic repair
passes, verifier calls, or provider retries.

## Testing strategy

The backend test layers include:

- pure unit tests for schemas, mappers, normalizers, confidence rules, context
  builders, prompt builders, and composers;
- service and route tests with deterministic repositories and fake executors;
- OpenAI adapter tests through an injected client;
- isolated PostgreSQL integration tests against committed migrations;
- build verification that packages all active Generation templates.

The ordinary test suite is database- and network-independent. Database tests
require an explicit `DATABASE_TEST_URL`, reject the development database, and
reset only isolated test state.

## Current MVP limitations

The backend is designed for a trusted local single user. It does not include:

- authentication, authorization, or tenant isolation;
- production deployment and network hardening;
- asynchronous AI workers or distributed workflow locks;
- autonomous agents or automatic application submission;
- multi-provider product routing;
- automatic document export, email, or calendar integrations.

These are deliberate scope boundaries, not claims of production readiness.
