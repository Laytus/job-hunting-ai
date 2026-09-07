# AI trust boundaries

## Purpose

Job Hunting AI uses language models to analyze roles, gather Research evidence,
and draft documents. The model is an assistant inside explicit application
boundaries, not a source of domain truth.

This document defines which sources each workflow may use, which conclusions
the system owns deterministically, and which inferences are intentionally
prohibited.

## Source-of-truth hierarchy

| Information | Authoritative source |
| --- | --- |
| Candidate identity, history, skills, projects, education, and preferences | Candidate Profile |
| Opportunity identity and lifecycle | Application |
| Role description, requirements, and responsibilities | Job Description |
| Interview schedule, notes, and feedback | Interview records |
| External company, role, compensation, and interview findings | Verified Research graph |
| Candidate-to-role interpretation | One immutable Analyze result |
| Generated prose | One editable DocumentVersion |
| Provider operation and token metadata | AI usage record |

AI output never silently overwrites Candidate, Application, Job Description,
Interview, or manually edited Document data.

## Candidate facts

Candidate claims must be grounded in fields selected from the canonical
Candidate aggregate. The workflows preserve evidence-category distinctions:

- employment evidence is direct professional experience;
- project work is project evidence, not automatically professional experience;
- education, coursework, and self-study are learning evidence, not professional
  expertise;
- goals, target roles, and interests express intent, not demonstrated ability;
- adjacent technical experience is transferable evidence, not proof of
  domain-specific practice.

For example, engineering or financial-data experience does not by itself prove
professional investment research, systematic trading, alpha research, or signal
research experience.

The system must not invent Candidate metrics, achievements, credentials,
employers, project completion, confidential work, availability, or personal
details.

## Job facts

Application and Job Description fields are the primary sources for the role,
employer, location, responsibilities, and requirements.

A job URL is context, not proof that the provider consulted that page. External
claims become Research evidence only through the verified provenance process.
Analyze and Generation must not expand a short Job Description with assumed
employer, team, product, or market facts.

## Analyze boundaries

Analyze receives an explicit whitelist from:

- Candidate Profile;
- Application;
- Job Description.

It excludes prior analyses and scores, Research, generated Documents, AI usage,
timeline events, interview notes, provider metadata, Application priority, and
Job Description structured extraction data.

The model returns structured role and fit analysis. Backend code validates the
response and computes the suggested score; the model does not provide the final
score. Analyze results are immutable historical interpretations and never
change Application priority automatically.

## Research boundaries

Research receives only approved Application and owned Job Description context.
It does not receive Candidate facts, Analyze results, earlier Research,
Documents, Interviews, timeline events, AI usage, or private Application notes.

The provider call may use the explicitly enabled `web_search` capability. The
model proposes structured sources, claims, evidence relationships, evidence
types, and source classifications. It does not own final claim confidence.

After the call, deterministic application code:

1. compares structured source URLs with provider-observed web sources;
2. keeps the verified supported subgraph;
3. normalizes and deduplicates URLs;
4. validates graph ownership and structured values;
5. derives source independence and UTC calendar-date freshness;
6. assigns `LOW`, `MEDIUM`, or `HIGH` confidence through named rules;
7. derives ordered warnings and a claim-grounded summary.

Malformed structured source URLs fail validation. Malformed or blank
provider-only metadata is ignored, but it cannot verify a structured source.
Unmatched structured sources are discarded before persistence. If no defensible
supported claim remains, Research may complete with an empty evidence graph
rather than manufacture a finding.

Compensation remains source-reported: base and total compensation stay
separate, amounts and ranges must be valid, and the application performs no
currency conversion or annualization. Generic or partially specific
compensation evidence cannot reach `HIGH` confidence solely because multiple
sources agree.

## Generation boundaries

Generation requires the canonical Candidate, Application, and Job Description.
The latest completed Analyze and Research results are optional. Each document
type has a separate context projection:

- Cover Letters receive bounded Candidate/job context and only supported,
  non-contradicted, non-low-confidence Research facts from an explicit
  whitelist.
- Application Briefs may use the full validated Research graph and Analyze
  interpretation.
- Interview Briefs use relevant company, role, technology, culture, and
  interview-process Research, but exclude compensation.

The model returns strict structured prose fields. Backend composers own stable
headings, deterministic facts, warning rendering, dates, and final Markdown
assembly. Generated Documents are user-reviewable and editable, and every
change creates an append-only DocumentVersion.

Regeneration starts from current canonical sources. It does not treat the
existing generated or manually edited document as new factual evidence.

Prompts prohibit unsupported Candidate claims, but model prose still requires
human review.

## Grounding and provenance

The trust chain is:

```text
domain source or provider-observed URL
    → workflow-owned context projection
    → strict structured response
    → runtime and business validation
    → deterministic derivation/composition
    → explicit persisted artifact
```

Persisted Analyze runs, Research graphs, generated DocumentVersions, and AI
usage rows keep workflow-specific provenance. Provider SDK payloads do not
cross into domain contracts.

Research evidence links preserve both supporting and contradicting
relationships. Confidence is derived from the verified graph rather than model
assertion. Generation metadata records the source records and versioned prompt,
context, template, and specification used for each generated version.

## Intentionally prohibited inferences

The workflows must not infer:

- current residence from an earlier workplace or a target location;
- work authorization or sponsorship status from residence, nationality,
  relocation willingness, or job location;
- immediate availability or operational readiness without an explicit source;
- professional expertise from coursework, self-study, or interest;
- professional experience from a project description;
- completed capability from a project plan;
- employer, product, team, compensation, or interview facts from general
  plausibility;
- confidential methods, results, or project details that are not explicitly
  supplied;
- missing numeric achievements or performance metrics.

Unresolved constraints remain unresolved and should surface as limitations,
not optimistic assumptions.

## Failure behavior

- Usage checks fail closed before provider execution.
- Automatic provider retries are disabled.
- Invalid JSON or schema output fails before business persistence.
- Unverified Research evidence cannot enter the persisted graph.
- Invalid Research structure or values fail the run.
- Failed document composition does not persist partial Markdown.
- Provider payloads and secrets are not exposed through public API errors.
- Automated tests use fakes or injected clients and do not call OpenAI.

## MVP limitations

These boundaries support a local single-user workflow; they are not a complete
safety, security, or factual-accuracy system.

The MVP does not include authentication, tenant isolation, autonomous agents,
RAG or vector databases, human approval enforcement, independent factual
verification beyond Research provenance, distributed AI-job coordination, or
production deployment controls. A user must review generated analysis,
Research, and documents before relying on them.
