# Job Hunting AI --- API Contract

## Purpose

This document defines the API contracts for the MVP application.

The API is organized around:

-   Candidate management
-   Applications
-   Job descriptions
-   Interviews
-   Application events
-   Documents
-   AI-assisted Analyze and Research workflows

The API follows a vertical-slice architecture where each feature owns
its validation, business rules, and persistence boundaries.

------------------------------------------------------------------------

# Implemented MVP API

## Candidate

Implemented:

``` text
Candidate profile endpoints
Candidate aggregate management
```

The Candidate domain provides the factual candidate context used by
the Analyze and Generation workflows.

------------------------------------------------------------------------

## Applications

Implemented:

``` text
Application creation
Application retrieval
Application updates
Application lifecycle management
```

Current Application fields include:

-   company
-   role
-   location
-   source
-   status
-   priority
-   dates
-   notes

------------------------------------------------------------------------

## Job Description

Implemented:

``` text
Job Description creation
Job Description retrieval
Job Description updates
```

Job descriptions store structured Markdown sections:

-   description
-   requirements
-   responsibilities

Optional structured extraction data is stored but excluded from current AI
workflow context.

------------------------------------------------------------------------

## Interviews

Implemented:

``` text
Interview management
Interview notes
Interview feedback
```

Interview data is available as future preparation context.

------------------------------------------------------------------------

## Application Events

Implemented:

``` text
Application timeline events
Read-only event history
```

Events represent application history and are not event sourcing.

------------------------------------------------------------------------

# Document API

The Document System is the persistence boundary for manual and generated
documents.

## Implemented endpoints

### Create Document

``` http
POST /api/v1/documents
```

Creates:

-   Document
-   Initial DocumentVersion

------------------------------------------------------------------------

### Get Document

``` http
GET /api/v1/documents/:id
```

Returns:

-   document metadata
-   current version content

------------------------------------------------------------------------

### Update Document Metadata

``` http
PUT /api/v1/documents/:id
```

Updates document-level fields.

Content is not replaced through this endpoint.

------------------------------------------------------------------------

### List Document Versions

``` http
GET /api/v1/documents/:id/versions
```

Returns immutable document history.

------------------------------------------------------------------------

### Create Document Version

``` http
POST /api/v1/documents/:id/versions
```

Creates a new append-only version and updates the current version
pointer.

------------------------------------------------------------------------

# Analyze API

Analyze runs are immutable historical resources owned by an Application.

``` text
POST /api/v1/applications/:applicationId/analyze
GET  /api/v1/applications/:applicationId/analyses
GET  /api/v1/applications/:applicationId/analyses/:analysisId
GET  /api/v1/applications/:applicationId/analyses/latest-completed
```

The synchronous POST accepts no configuration body and returns the completed
Job Analysis with `201 Created`. History uses compact summaries in deterministic
newest-first order. Detail and latest-completed return the full validated
analysis data. A Job Analysis requested through another Application is treated
as not found.

Run statuses are `RUNNING`, `COMPLETED`, and `FAILED`. Reruns append history;
they do not replace earlier results. The backend owns deterministic suggested
score calculation, and `null` is valid when no requirements are evaluable.
Analyze never changes Application priority.

The POST uses backend-owned provider, model, prompt, schema, usage, stale-run,
and scoring configuration. Analyze read endpoints are side-effect free and do
not construct a provider or recover stale runs.

------------------------------------------------------------------------

# Research API

Research runs are immutable historical resources owned by an Application.

``` text
POST /api/v1/applications/:applicationId/research
GET  /api/v1/applications/:applicationId/researches
GET  /api/v1/applications/:applicationId/researches/:researchId
GET  /api/v1/applications/:applicationId/researches/latest-completed
```

The synchronous POST accepts only an absent, null, or empty JSON body and
returns the canonical completed Research detail with `201 Created`. Provider,
model, prompt, web-search, token, source-limit, and confidence configuration are
server-owned.

History returns compact run metadata in repository-defined newest-first order
without loading each evidence graph. Detail and latest-completed return:

``` text
run metadata
summaryMarkdown
warnings
sources
claims
claim-source relationships
```

Source DTOs preserve original URLs but omit internal normalized URLs and child
ownership IDs. Claim DTOs return persisted structured values, evidence type,
and backend-owned confidence without recalculation. Relationships preserve both
`SUPPORTS` and `CONTRADICTS` evidence.

New `research-v2` details may carry `amountMin` and `amountMax` in compensation
`valueJson`; the same generic JSON field continues to serialize historical
`research-v1` exact-amount values unchanged. A sparse `COMPLETED` result is a
successful detail with a bounded summary/warnings and empty graph arrays, not a
not-found or provider error.

Unknown Research, cross-Application detail, and an absent latest-completed
Research return `404`. Invalid identifiers or non-empty POST bodies return
`400`. Required-source/active-run conflicts return `409`; usage denial returns
`429`; provider, structured-output, provenance, and Research-validation failures
return `502`; usage-infrastructure failures return `503`; persistence and
unexpected failures return `500`. All use the shared API error envelope.

Research GET routes are side-effect free and do not require OpenAI or model
configuration. Only POST reaches lazily constructed tracked execution.

------------------------------------------------------------------------

# Generation API

Generation is synchronous in the MVP and exposes a profile suggestion plus two
Application-owned operations:

``` text
GET  /api/v1/applications/:applicationId/generation/cover-letter-profile
POST /api/v1/applications/:applicationId/generation
POST /api/v1/applications/:applicationId/documents/:documentId/regenerate
```

First Generate accepts one of:

```json
{ "documentType": "COVER_LETTER", "outputLanguage": "en", "market": "UNITED_KINGDOM", "sector": "SOFTWARE_TECH" }
{ "documentType": "COVER_LETTER", "outputLanguage": "fr", "market": "FRANCE", "sector": "ASSET_MANAGEMENT" }
{ "documentType": "APPLICATION_BRIEF" }
{ "documentType": "INTERVIEW_BRIEF" }
```

Cover Letter language, market, and sector are explicit and never replaced by
the advisory profile suggestion. Application and Interview Brief requests omit
language and are canonically English. Generate returns `201 Created` and
`Location: /api/v1/documents/:documentId`.

Regenerate requires explicit `outputLanguage`, `market`, and `sector` for Cover
Letters and accepts an empty, absent, null, or explicit-English body for
fixed-English briefs. It returns `200 OK`. Both operations return the same safe
resource shape:

``` text
document metadata
current DocumentVersion, including contentMarkdown and persisted metadata
deterministic Generation warnings
```

The HTTP layer invokes `GenerationService` once and never loads prior Document
content. Regenerate resolves type and ownership inside the service; a foreign
Application target is indistinguishable from a missing target and returns `404
DOCUMENT_NOT_FOUND`. Successful Regenerate creates a new current version and
preserves history.

Invalid identifiers and request/type/language combinations return `400`.
Unavailable required sources and missing targets return `404`. Existing logical
documents, invalid generated targets, invalid source context, and active work
return `409`. Usage denial returns `429`; provider, structured-output, template,
and composition failures return `502`; usage-infrastructure failures return
`503`; persistence and unexpected failures return `500`. All responses use the
shared safe error envelope.

There are no Generation jobs, polling endpoints, retries, or web-search calls.
Provider and tracked-executor construction is lazy, so app startup and ordinary
GET routes do not require OpenAI configuration.

------------------------------------------------------------------------

# AI Document Types

Supported document concepts:

``` text
MARKDOWN_NOTE
COVER_LETTER
APPLICATION_BRIEF
INTERVIEW_BRIEF
```

`APPLICATION_BRIEF` is aligned across the database, backend Document contract,
and frontend mirror. Generation operates on the three generated types;
`MARKDOWN_NOTE` remains a manual Document type.

Future document types may be introduced only when a concrete workflow
requires them.

------------------------------------------------------------------------

# API Design Principles

## Separation of concerns

The API layer:

-   validates requests;
-   maps HTTP concerns;
-   delegates business logic.

Domain services own:

-   validation;
-   workflows;
-   persistence coordination.

------------------------------------------------------------------------

## Versioned content

Document content follows append-only semantics.

Updating content means:

``` text
Create DocumentVersion
        ↓
Update current_version_id
```

Previous versions remain available.

------------------------------------------------------------------------

## AI boundaries

AI workflows must:

-   use provider abstractions;
-   validate structured outputs;
-   preserve provenance;
-   avoid modifying source domain data automatically.

Generated documents become user-controlled artifacts stored through the
Document System.

------------------------------------------------------------------------

# MVP Scope Boundaries

The API does not include:

-   authentication;
-   multi-user support;
-   company database;
-   automatic job scraping;
-   email/calendar integrations;
-   RAG;
-   vector databases;
-   AI agents;
-   asynchronous workers.
