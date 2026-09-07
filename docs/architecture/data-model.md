# Job Hunting AI --- Data Model

## Purpose

This document defines the core data model of Job Hunting AI.

The model is designed around explicit domain ownership, normalized
persistence, and clear boundaries between factual user data, application
workflow data, and AI-generated information.

------------------------------------------------------------------------

# Implementation Status

Implemented MVP entities:

-   CandidateProfile
-   Application
-   JobDescription
-   Interview
-   ApplicationEvent
-   Document
-   DocumentVersion
-   JobAnalysis
-   AiUsage
-   Research
-   ResearchSource
-   ResearchClaim
-   ResearchClaimSource

Generation execution is implemented without a separate Generation entity. It
reuses Application-owned `Document` and append-only `DocumentVersion` records,
with versioned generation provenance stored in `DocumentVersion.metadata`.

------------------------------------------------------------------------

# Core Entities

## CandidateProfile

Represents the user's factual professional context.

Contains:

-   personal information;
-   education;
-   experience;
-   projects;
-   skills;
-   languages.

Candidate data is reusable context for applications and AI
workflows.

------------------------------------------------------------------------

## Application

Represents a job application process.

Contains:

-   company;
-   role;
-   location;
-   source;
-   status;
-   priority;
-   notes;
-   lifecycle information.

An Application is the central workspace entity.

------------------------------------------------------------------------

## JobDescription

Represents role-specific information.

Contains:

-   description;
-   requirements;
-   responsibilities;
-   optional structured information.

AI extraction remains a future workflow.

------------------------------------------------------------------------

## Interview

Represents interview preparation information.

Contains:

-   interview details;
-   notes;
-   feedback.

------------------------------------------------------------------------

## ApplicationEvent

Represents immutable application timeline history.

Events provide chronological context but are not event sourcing.

------------------------------------------------------------------------

# Analyze History

## JobAnalysis

Represents one immutable Analyze execution owned by an Application.

Multiple historical runs are retained. At most one `RUNNING` JobAnalysis may
exist per Application, enforced through a partial unique index. Completed rows
contain validated Analyze output and the backend-computed suggested score.

Analyze does not mutate Application priority.

------------------------------------------------------------------------

# Research Evidence Graph

## Research

Represents one historical Research execution owned by an Application.

Research uses the lifecycle:

``` text
RUNNING -> COMPLETED
RUNNING -> FAILED
```

Reruns append new rows, and a partial unique index permits at most one `RUNNING`
Research per Application. `researchDate` is the persisted reference timestamp
for later deterministic freshness rules. `summaryMarkdown` is optional
human-readable synthesis; the evidence graph remains authoritative.

## ResearchSource

Represents an external source used by one Research execution. It preserves the
navigable URL, per-run normalized URL, source type and quality, optional
publication date, retrieval timestamp, and concise source context.

Normalized URLs are unique within one Research execution, not globally.

## ResearchClaim

Represents one structured Research finding. Claims preserve distinct claim,
evidence, and confidence enums and require at least one of text or JSON value.
Base salary and total compensation remain separate claim types.

## ResearchClaimSource

Connects claims to supporting or contradicting sources. The join stores concise
evidence text and includes `research_id` so composite foreign keys enforce:

``` text
ResearchClaim.researchId == ResearchSource.researchId
```

This prevents cross-Research evidence links in PostgreSQL. Completing a
Research persists sources, claims, relationships, and the terminal Research
state in one transaction, so a failed completion leaves no partial graph.

Application deletion cascades through the complete Research graph.

------------------------------------------------------------------------

# Document System

## Document

Represents a persistent document artifact.

A Document contains:

-   ownership;
-   document type;
-   title;
-   current version reference;
-   timestamps.

Documents support two ownership models:

-   Candidate-owned documents.
-   Application-owned documents.

A Document must have exactly one owner.

------------------------------------------------------------------------

## DocumentVersion

Represents immutable document content history.

Contains:

-   document reference;
-   Markdown content;
-   metadata;
-   creation timestamp.

Document content updates are append-only.

Updating content creates a new DocumentVersion instead of replacing
existing content.

------------------------------------------------------------------------

# Document Versioning Strategy

The current version is stored through:

``` text
Document.current_version_id
            |
            v
DocumentVersion.id
```

The relationship uses a deferred foreign-key strategy to allow atomic
creation workflows.

Conceptually:

``` text
Create Document
        +
Create initial DocumentVersion
        +
Set current_version_id
```

For updates:

``` text
Create new DocumentVersion
        +
Move current_version_id
```

Previous versions remain immutable.

------------------------------------------------------------------------

# Ownership Rules

Documents use an exclusive ownership model:

``` text
Document
    |
    +-- candidate_id
    |
    +-- application_id
```

Exactly one owner must exist.

Examples:

Candidate-owned:

-   general CV;
-   reusable personal documents.

Application-owned:

-   cover letter;
-   application brief;
-   interview brief.

------------------------------------------------------------------------

# Document Types

Supported document concepts:

``` text
MARKDOWN_NOTE
COVER_LETTER
APPLICATION_BRIEF
INTERVIEW_BRIEF
```

`APPLICATION_BRIEF` was added to the PostgreSQL `document_type` enum in a
minimal forward-only migration. No separate Generation persistence entity was
required.

The generic Document system does not currently enforce uniqueness for
`(application_id, type)`. `DocumentVersion.metadata` remains a nullable JSON
object, and `current_version_id` continues to advance atomically with version
creation inside repository transactions.

Generation creates the initial Document/DocumentVersion pair through this
existing model. Regeneration creates a normal new DocumentVersion, preserves
prior immutable versions, and advances `current_version_id` atomically.

Additional document types should only be introduced when required by a
concrete workflow.

------------------------------------------------------------------------

# AI Data Boundary

AI workflows consume existing domain entities:

-   CandidateProfile;
-   Application;
-   JobDescription;
-   Interview;
-   Document.

AI-generated information should be stored explicitly and preserve:

-   provenance;
-   workflow information;
-   version history.

AI output should not silently mutate factual source data.

Research persistence is evidence-centered and Application-owned. It has no
Candidate, JobAnalysis, Interview, Document, or ApplicationEvent foreign key.
Provider execution, API routes, and frontend behavior are not part of the
persistence contract. The execution service now supplies one Research date to a
pure business boundary that normalizes and provenance-checks selected URLs,
validates graph and structured-value invariants, and derives source independence,
freshness, backend-owned confidence, and warnings. The service maps its logical
graph keys and one post-provider retrieval timestamp into the repository's
atomic completed-graph command; database UUID generation and transactions remain
repository concerns.

------------------------------------------------------------------------

# Design Principles

The data model follows:

-   explicit ownership;
-   normalized persistence;
-   immutable content history;
-   clear AI boundaries;
-   migration-controlled evolution.

The current model supports implemented Analyze history, the Research evidence
graph, AI usage tracking, and Generation through Application-owned Documents
and append-only DocumentVersions. No separate Generation persistence entity is
required by the MVP.
