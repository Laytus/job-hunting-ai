# Generation Pipeline Contract

## 1. Purpose

The Generation pipeline turns verified application context into editable,
versioned Markdown documents. It supports:

- Cover Letters;
- Application Briefs;
- Interview Briefs.

This contract describes the production behavior implemented by the API. It
defines inputs, trust boundaries, active prompt and template versions, output
structure, persistence, and failure handling.

Generation does not replace Candidate, Analyze, or Research as sources of
truth. It projects those sources into a document-specific context, asks the
configured language model for a strict structured response, and composes the
final Markdown deterministically.

## 2. Pipeline

```text
Application + Job Description + Candidate
             |
             +-- latest completed Analyze result, when available
             |
             +-- latest completed Research graph, when available
             v
GenerationContextBuilder
             v
versioned template + versioned prompt + strict JSON schema
             v
one provider call
             v
runtime validation
             v
deterministic Markdown composer
             v
Document + DocumentVersion
```

The model supplies bounded prose fields. Application identity, headings,
dates, warnings, and document assembly remain application-owned.

## 3. Sources of truth and trust boundaries

Required source data:

- one Application;
- its Job Description;
- the canonical Candidate aggregate.

Optional source data:

- the latest completed Analyze result for the Application;
- the latest completed Research aggregate for the Application.

The builder rejects missing required sources and cross-application source
relationships. A supplied Research aggregate must be a valid graph.

Candidate claims may come only from Candidate data. Job and employer claims may
come only from the Application, Job Description, or admitted Research claims.
Analyze can organize requirements, evidence, gaps, and constraints, but it does
not create facts. Missing optional sources produce warnings rather than guessed
content.

## 4. Active versions

| Document | Language | Context | Prompt | Template | Specification |
| --- | --- | --- | --- | --- | --- |
| Cover Letter | English | `generation-context-v2` | `cover-letter-v4` | `cover-letter-en-v2` | `cover-letter-spec-v3` |
| Cover Letter | French | `generation-context-v2` | `cover-letter-v4` | `cover-letter-fr-v2` | `cover-letter-spec-v3` |
| Application Brief | English | `generation-context-v1` | `application-brief-v1` | `application-brief-en-v1` | — |
| Interview Brief | English | `generation-context-v1` | `interview-brief-v2` | `interview-brief-en-v1` | — |

Historical Cover Letter prompt, context, template, and specification identifiers
remain valid metadata values for previously generated versions. They are not
active generation choices.

## 5. Common generation rules

All document types use a strict JSON Schema response format and matching runtime
validation. The provider request has no tools. Generation does not invoke web
search and does not perform classifier, verifier, repair, or retry calls.

The model must:

- use only the supplied context;
- distinguish direct evidence, transferable evidence, projects, education,
  self-study, and interest;
- avoid invented facts, metrics, credentials, authorization, availability, or
  confidential details;
- avoid presenting missing or uncertain information as fact;
- return only the requested structured fields.

The composer rejects invalid structured output. It does not attempt to repair
model content.

## 6. Cover Letter

### Profile

A Cover Letter request requires an explicit profile:

- language: `en` or `fr`;
- market: `FRANCE`, `UNITED_KINGDOM`, or `UNITED_STATES`;
- sector: `QUANT_TRADING`, `INVESTMENT_BANKING`,
  `ASSET_MANAGEMENT`, `SOFTWARE_TECH`, `CONSULTING`,
  `GENERAL_FINANCE`, or `GENERAL`.

Profile suggestion is advisory. The explicit generation request is
authoritative.

The active specification resolves profile-dependent word targets, paragraph
strategy, tone, evidence discipline, personalization, sector emphasis, language
guidance, salutation, closing, and date style.

### Research projection

Cover Letters admit only:

- `COMPANY_DESCRIPTION`;
- `BUSINESS_AREA`;
- `PARIS_PRESENCE`;
- `ROLE_INFORMATION`;
- `TECHNOLOGY`.

An admitted claim must be a `FACT`, must not have `LOW` confidence, must
have supporting evidence, and must have no contradicting evidence.
Compensation, culture, interview-stage, interview-topic, and general
`OTHER` claims are excluded.

Only evidence snippets and limited source labels needed for grounding enter the
Cover Letter context. Source URLs and unrelated Research material do not.

### Structured output and composition

The model returns three to five body paragraphs defined by the active response
schema. The composer owns document headings, Candidate and recipient blocks,
generation date, subject, salutation, paragraph ordering, and closing.

A synthetic shape of the persisted Markdown is:

```markdown
# Title

Application for Quantitative Developer

# Candidate header

Example Candidate
Example City
https://example.com/profiles/example-candidate

# Recipient

Example Trading Company
Example City

# Date

<generation-date>

# Subject

Application for Quantitative Developer

# Body

Dear Hiring Team,

<grounded employer-and-role paragraph>

<grounded candidate-evidence paragraph>

<grounded contribution paragraph>

Yours sincerely,

Example Candidate
```

The example is structural only. Production values are composed from the
selected Application and canonical Candidate.

## 7. Application Brief

Application Briefs are English-only. They synthesize:

- application and Job Description facts;
- Candidate fit;
- Analyze requirements, evidence, gaps, and constraints when available;
- all relevant validated Research claims;
- warnings and caveats.

The persisted Markdown contains:

- title and application identity;
- executive summary;
- role overview;
- key requirements;
- Candidate strengths;
- gaps and risks;
- relevant Research;
- compensation, when supported;
- positioning strategy;
- points to emphasize;
- preparation priorities;
- caveats.

The composer owns stable headings and deterministic application fields. The
model supplies the bounded analytical prose and lists defined by the response
schema.

## 8. Interview Brief

Interview Briefs are English-only. They prepare the Candidate for a specific
role without inventing interview process details or Candidate stories.

They admit these Research claim types:

- `COMPANY_DESCRIPTION`;
- `BUSINESS_AREA`;
- `ROLE_INFORMATION`;
- `TECHNOLOGY`;
- `INTERVIEW_STAGE`;
- `INTERVIEW_TOPIC`;
- `CULTURE`.

Compensation, `PARIS_PRESENCE`, and `OTHER` claims are excluded.

The persisted Markdown contains:

- title and application identity;
- interview objective;
- Candidate positioning;
- strengths to emphasize;
- gaps to prepare;
- reported interview process and topics;
- technical and behavioral preparation;
- practice questions;
- questions for the interviewer;
- final preparation checklist;
- Research caveats.

Practice prompts may invite the Candidate to prepare an example. They must not
fabricate a completed story or transform adjacent evidence into direct
experience.

## 9. Warnings

Generation warnings use a fixed vocabulary:

- `NO_ANALYSIS_AVAILABLE`;
- `NO_RESEARCH_AVAILABLE`;
- `NO_RELIABLE_COMPANY_FACTS`;
- `NO_RELIABLE_INTERVIEW_DATA`;
- `INSUFFICIENT_CANDIDATE_EVIDENCE`;
- `UNRESOLVED_HARD_CONSTRAINT`;
- `STALE_ANALYSIS`;
- `STALE_RESEARCH`;
- `LOW_CONFIDENCE_RESEARCH_INCLUDED`;
- `OTHER`.

Warnings are derived by application logic, persisted in generation metadata,
and returned by the API. They are not free-form model output.

## 10. Provenance metadata

Every generated DocumentVersion stores generation provenance:

```json
{
  "generation": {
    "contextVersion": "generation-context-v2",
    "documentType": "COVER_LETTER",
    "outputLanguage": "en",
    "promptVersion": "cover-letter-v4",
    "templateVersion": "cover-letter-en-v2",
    "coverLetterMarket": "UNITED_KINGDOM",
    "coverLetterSector": "QUANT_TRADING",
    "coverLetterSpecificationVersion": "cover-letter-spec-v3",
    "jobDescriptionId": "<job-description-id>",
    "jobAnalysisId": "<job-analysis-id-or-null>",
    "researchId": "<research-id-or-null>",
    "candidateContextUpdatedAt": "<candidate-context-timestamp>",
    "contextResearchClaimIds": ["<research-claim-id>"],
    "contextAnalyzeRequirementIds": [],
    "contextAnalyzeEvidenceIds": [],
    "warnings": [],
    "model": "<resolved-provider-model>"
  }
}
```

Brief metadata uses its active context, prompt, and template identifiers and
does not include Cover Letter profile or specification fields.

Metadata records the inputs selected for that version. A later edit or source
change does not rewrite historical provenance.

## 11. Generate and regenerate semantics

Generate:

- requires no existing Document of the same type for the Application;
- creates one Document and its first DocumentVersion;
- returns the Document, current version, and warnings;
- returns `DOCUMENT_ALREADY_EXISTS` when the unique target already exists.

Regenerate:

- targets an existing generated Document belonging to the Application;
- requires an explicit Cover Letter profile for Cover Letters;
- creates a new DocumentVersion on the existing Document;
- never uses current edited Markdown as model context;
- leaves earlier versions intact.

Manual editing is a separate document-version operation. Regeneration always
rebuilds from current canonical sources.

## 12. HTTP API

The API exposes:

- `GET /api/v1/applications/:applicationId/generation/cover-letter-profile`;
- `POST /api/v1/applications/:applicationId/generation`;
- `POST /api/v1/applications/:applicationId/documents/:documentId/regenerate`.

Cover Letter generation bodies require:

```json
{
  "documentType": "COVER_LETTER",
  "outputLanguage": "en",
  "market": "UNITED_KINGDOM",
  "sector": "QUANT_TRADING"
}
```

Application Brief and Interview Brief generation bodies contain only
`documentType`. They resolve to English.

Successful generation returns HTTP 201 with a Document location. Successful
regeneration returns HTTP 200. Error responses use the shared API error
envelope and stable generation error codes.

## 13. Persistence and concurrency

Provider execution occurs outside the database transaction. After successful
structured generation and composition, persistence creates either:

- a new Document with version 1; or
- the next version of an existing Document.

The service rejects a known existing Document of the same generated type, and
in-process single-flight protection rejects concurrent generation for the same
target with `GENERATION_ALREADY_RUNNING`. The generic Document schema does not
enforce uniqueness on `(application_id, type)`, so distributed generation would
need an additional database-backed concurrency boundary.

Provider usage is recorded independently and remains auditable if later
composition or persistence fails.

## 14. Failure safety

Failures are fail-closed:

- missing Candidate, Application, or Job Description stops generation;
- invalid source relationships stop context construction;
- unsupported type, language, template, market, or sector is rejected;
- invalid provider structure stops before document persistence;
- composition failure does not persist partial Markdown;
- persistence failure does not report success.

No fallback document is silently substituted. No second provider call is made.

## 15. Product boundary

The frontend may suggest a Cover Letter profile, submit explicit selections,
display warnings, open the persisted Document, edit it, and request
regeneration. The API remains authoritative for validation and persistence.

Generation does not:

- mutate Candidate, Application, Job Description, Analyze, or Research data;
- browse the web;
- perform Research or Analyze;
- convert currencies or infer unsupported employment facts;
- export files or send applications;
- run background generation jobs.

These constraints keep model behavior bounded, source provenance inspectable,
and every generated artifact editable and versioned.
