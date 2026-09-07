# Job Hunting AI — LLM Architecture

## Purpose

This document defines the architecture principles and current implementation of the Large Language Model (LLM) integration layer of Job Hunting AI.

The goal is to introduce AI capabilities while preserving:

- separation of concerns;
- deterministic testing;
- provider independence;
- structured outputs;
- usage protection;
- provenance;
- maintainable workflows.

The LLM layer remains independent from core application domains.

---

# Implementation Status

The shared LLM infrastructure and all three AI workflows are implemented.

Implemented:

- generic `LlmProvider`, request, response, and provider-error contracts;
- centralized `LlmConfig`;
- `FakeLlmProvider` for deterministic tests;
- `OpenAiLlmProvider` using the OpenAI Responses API;
- generic, opt-in Responses API web-search capability with provider-reported
  consulted-source metadata;
- optional provider-independent JSON Schema response formats;
- structured JSON parsing and Zod runtime validation;
- PostgreSQL AI usage persistence;
- `AiUsageGuard`;
- `AiUsageRecorder`;
- `TrackedLlmExecutor`;
- offline automated tests and separate manual OpenAI smoke-test paths;
- end-to-end Analyze and Research structured execution;
- deterministic provider-observed Research subgraph projection before strict
  graph validation; and
- end-to-end Generation context, prompt, structured output, composition,
  Document persistence, and regeneration using four active versioned writing
  template paths.

Analyze, Research, and Generation consume this infrastructure without
redesigning the provider, structured-output, or usage boundaries. The shared
global model path has been validated across all three workflows.

One accepted non-blocking limitation remains: concurrent calls may race around the optional usage ceiling. This is acceptable for the initial synchronous MVP workflows.

---

# Design Principles

## AI is a service capability

AI workflows must not become part of existing domain entities.

The architecture separates:

```text
Application Domain
        |
        v
AI Workflow Layer
        |
        v
Tracked LLM Execution
        |
        v
LLM Provider Layer
```

Existing domain modules provide controlled context.

AI workflows generate validated outputs.

---

## Provider abstraction

Application services depend on the generic:

```text
LlmProvider
```

rather than directly on a provider SDK.

Implemented providers:

```text
LlmProvider
├── FakeLlmProvider
└── OpenAiLlmProvider
```

`FakeLlmProvider` supports deterministic testing.

`OpenAiLlmProvider` is the MVP real provider and uses the OpenAI Responses API.

Provider-specific SDK types remain inside the OpenAI adapter.

The MVP does not require a complete multi-provider product.

---

# LLM Provider Interface

The provider layer encapsulates generic model execution and provider-specific request/response mapping.

Conceptual flow:

```text
Workflow Service
        |
        v
LlmProvider
        |
        v
Provider Adapter
        |
        v
LLM API
```

The generic request supports:

- ordered `system`, `user`, and `assistant` messages;
- optional model override;
- optional JSON Schema response format;
- optional generic tools, currently limited to explicit `web_search` opt-in.

The generic response exposes:

- text content;
- model metadata when available;
- provider-reported token usage when available;
- provider-reported web source URLs when web search is used.

The provider layer does not own:

- Candidate/Application/Document business logic;
- Analyze, Research, or Generate workflow logic;
- prompt construction;
- business schemas;
- domain persistence.

---

# AI Configuration

Generic LLM configuration is centralized through `LlmConfig`.

Supported environment overrides:

```env
LLM_MODEL=gpt-5.6-terra
LLM_TIMEOUT_MS=90000
LLM_MAX_TOKENS=
```

The normal MVP configuration uses `gpt-5.6-terra` as the single global model
for Analyze, Research, and all Generation document types. `LLM_MODEL` preserves
the existing global environment override; workflows do not own separate model
configuration.

The default global provider timeout is 90 seconds. It is a maximum request
ceiling shared by every AI workflow, remains overridable through
`LLM_TIMEOUT_MS`, and does not enable provider retries.

The OpenAI secret remains provider-specific:

```env
OPENAI_API_KEY=
```

Credentials are not stored in `LlmConfig`, frontend code, or source code.

The local `.env` remains Git-ignored.

Real OpenAI execution requires both `OPENAI_API_KEY` and a valid `LLM_MODEL`
available to that OpenAI account. The generic default model identifier exists
for provider-independent configuration, but it is not a usable OpenAI model.
Configuration is loaded lazily so unrelated routes and Analyze read endpoints
can initialize without an OpenAI key.

---

# Testing Strategy

AI infrastructure tests remain deterministic and network-independent.

`FakeLlmProvider` supports:

- configurable responses;
- error simulation;
- request tracking;
- plain-text and structured-output requests.

`OpenAiLlmProvider` is tested through an injected client seam, so automated tests do not require a real API key or external API access.

A separate manual smoke test verifies the real OpenAI connection when required.

The manual `llm:smoke:web-search` path verifies web search and strict structured
output together while retaining source and usage metadata. It remains separate
from automated tests and CI.

---

# Structured Outputs

Structured AI responses follow:

```text
Generic JSON Schema request
        |
        v
Provider Structured Output
        |
        v
JSON.parse
        |
        v
Zod runtime validation
        |
        v
Typed validated result
```

`LlmRequest` can optionally carry a provider-independent JSON Schema response format.

`OpenAiLlmProvider` maps that request to OpenAI Structured Outputs.

Backend runtime validation remains authoritative even when the provider is instructed to follow a JSON Schema.

Malformed JSON and runtime schema-validation failures are distinct structured-output errors. Provider failures remain provider failures.

Current accepted limitation:

```text
JSON Schema
+
Zod runtime schema
```

are supplied separately by callers. This accepted duplication does not block
the synchronous MVP workflows.

Successful structured execution returns both runtime-validated data and the
underlying generic `LlmResponse`, so workflows can retain model, usage, and web
source metadata without exposing provider SDK types.

---

# Web Search Capability

Web search is a generic, request-scoped provider capability. A request must
explicitly include the `web_search` tool; requests without it preserve the
existing plain-text or structured-output behavior and send no search tool or
source-metadata include to OpenAI.

For enabled requests, `OpenAiLlmProvider` maps the capability to the Responses
API `web_search` tool, uses automatic tool selection, and requests
`web_search_call.action.sources`. The adapter collects provider-owned URLs from
search-action sources, reasoning-model `open_page` and `find_in_page` actions,
and output-text `url_citation` annotations. They are returned in memory as
generic `LlmResponse.webSources` metadata in provider-output order. The adapter
does not normalize URLs, infer publishers, score source quality, or persist
Research evidence.

Analyze does not request this capability and remains web-disabled. Research
requests it explicitly, then keeps provenance validation, normalization, and
execution orchestration in its Research business layer.

---

# AI Usage Tracking

Provider-reported token usage is authoritative.

Tracked plain-text execution follows:

```text
AiUsageGuard
      |
      v
LlmProvider.generate()
      |
      v
AiUsageRecorder
```

Tracked structured execution follows:

```text
AiUsageGuard
      |
      v
LlmProvider.generate()
      |
      v
AiUsageRecorder
      |
      v
JSON.parse
      |
      v
Zod validation
```

This ordering ensures billable provider usage is recorded before downstream structured parsing or validation can fail.

`AiUsageGuard` runs before provider execution and fails closed when usage state cannot be verified.

`AiUsageRecorder` persists reliable provider-reported usage and never estimates missing token counts or retries the provider.

PostgreSQL stores usage in `ai_usage` with:

- operation name;
- model;
- input tokens;
- output tokens;
- total tokens;
- creation timestamp.

The usage table deliberately does not store prompts, responses, secrets, pricing, or calculated monetary cost.

---

# Prompt Architecture

Production prompt builders and prompt versions belong to the business AI
workflow layer. Analyze implements this boundary with its deterministic
`AnalyzeContextBuilder`, versioned `analyze-v1` prompt, and workflow-owned JSON
Schema and Zod schema. Research now applies the same boundary with an
Application/Job Description-only `ResearchContextBuilder`, versioned
`research-v2` prompt, generic opt-in web search, and workflow-owned strict JSON
Schema and Zod schema.

The v2 Research prompt treats Application and Job Description URLs as context,
not evidence, unless the provider reports that web search accessed them. It
allows an explicitly sparse output, requires every emitted source to participate
in a claim relationship, requires positive claim support, and limits its summary
to emitted claims. Historical `research-v1` runs remain part of the read model.

Prompt changes should remain explicit and reviewable.

Persisted Analyze and generated Document versions record their applicable
prompt provenance. Provider adapters remain unaware of prompt contents and
Analyze, Research, or Generation business contracts.

---

# AI Workflows

The current MVP implements all three business AI workflows above the shared
tracked provider boundary: Analyze, Research, and Generation.

## Analyze

Analyze is implemented end-to-end and generates validated structured analysis
of:

- job description;
- application fit;
- missing information;
- preparation requirements.

It uses a controlled Candidate Profile, Application, and Job Description
source context, persists immutable `JobAnalysis` run history, computes the
suggested score deterministically in backend code, exposes synchronous
Application-owned HTTP resources, and renders results/history in the Angular
Application workspace.

## Research

The AI-facing Research context, prompt, and structured evidence contract are
implemented. Research is restricted to approved Application and source Job
Description fields, requests generic web search, and defines structured:

- source references;
- claims with supporting or contradicting evidence;
- bounded compensation/interview values;
- warnings and summary Markdown.

The LLM does not output final claim confidence. The backend first projects its
structured proposal to provider-observed sources and claims that retain verified
`SUPPORTS` evidence, removing invalidated relationships and orphan sources. The
existing strict validator then rechecks provenance and owns URL
normalization/deduplication, graph and structured-value validation, source
independence, calendar-based freshness, confidence, and warnings. Confidence is
therefore calculated only from the projected graph. `ResearchService` performs
one guarded and usage-recorded structured execution, preserves provider web
sources for projection and validation, recovers stale lifecycle rows at the
fixed boundary, and delegates one atomic completed-graph write to the Research
repository.

## Generate

Create AI-assisted documents:

- cover letters;
- application briefs;
- interview briefs.

Generated documents integrate with the existing Document System and preserve append-only version history.

Generation builds deterministic, versioned context, selects one of four active
source-controlled template paths, performs one guarded and usage-recorded
structured provider execution, validates the result, composes Markdown in
backend code, and atomically persists a Document and current DocumentVersion.
Regeneration uses the same path to append a normal version without using prior
document content as factual context. There is no automatic provider retry,
repair, verifier, or web-search call.

The active paths are:

- Cover Letter English: `cover-letter-v4`, `cover-letter-spec-v3`,
  `generation-context-v2`, and `cover-letter-en-v2`;
- Cover Letter French: `cover-letter-v4`, `cover-letter-spec-v3`,
  `generation-context-v2`, and `cover-letter-fr-v2`;
- Application Brief English: `application-brief-v1`, `generation-context-v1`,
  and `application-brief-en-v1`; and
- Interview Brief English: `interview-brief-v2`, `generation-context-v1`, and
  `interview-brief-en-v1`.

Template IDs and versions remain code-owned. The loader has no database,
provider, environment-variable, or prompt-interpolation dependency, and the API
build copies and verifies the four active resources.

---

# AI Data Boundaries

AI workflows may consume explicitly selected source-domain information. The
implemented Analyze whitelist includes only approved source fields from:

- candidate profile;
- application data;
- job description.

Analyze explicitly excludes Application priority, prior analyses and scores,
Job Description `structuredData`, generated Documents, Research results, AI
usage, timeline events, interview notes, and provider metadata. Candidate goals
and preferences remain context, not evidence of demonstrated experience.

AI workflows must not automatically mutate source domain entities.

Generated information must remain explicit, validated, and attributable to the workflow that produced it.

The business workflow layer owns the exact context whitelist; the provider layer does not.

---

# Analyze Workflow Integration

Analyze uses the existing infrastructure as:

```text
build operation-specific context, prompt, and schemas
        |
        v
tracked structured LLM execution
        |
        v
validated typed result
        |
        v
business logic / persistence
```

The resulting score is backend-owned and never supplied by the model or
recomputed by Angular. Analyze does not mutate Application priority. Each
successful or failed execution remains an immutable historical run, with one
database-enforced active `RUNNING` run per Application.

---

# Future Considerations

The architecture intentionally does not currently include:

- autonomous agents;
- RAG systems;
- vector databases;
- asynchronous AI workers;
- complex orchestration frameworks;
- model-pricing synchronization;
- monetary cost dashboards;
- concurrency control for optional usage ceilings.

These remain post-MVP and should be introduced only for concrete future
requirements.
