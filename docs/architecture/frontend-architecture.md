# Job Hunting AI --- Frontend Architecture

## Purpose

This document defines the frontend architecture of Job Hunting AI.

The frontend is designed around Angular standalone components,
feature-based organization, explicit state ownership, and clear
separation between UI concerns and backend domain logic.

------------------------------------------------------------------------

# Frontend Stack

Implemented stack:

-   Angular
-   TypeScript
-   Standalone components
-   Signals
-   Reactive Forms

The frontend follows a feature-oriented structure.

------------------------------------------------------------------------

# Application Structure

The frontend is organized by business features:

``` text
apps/web/src/app/

├── features/
│   ├── analyze/
│   ├── application/
│   ├── candidate/
│   ├── document/
│   ├── generation/
│   └── research/
├── core/
├── shared/
└── app.routes.ts
```

Each feature owns:

-   components;
-   models;
-   services;
-   tests;
-   feature-specific state.

------------------------------------------------------------------------

# Main Application Areas

Implemented:

## Applications Dashboard

Responsible for:

-   application listing;
-   application navigation;
-   application workflow entry point.

------------------------------------------------------------------------

## Application Detail

The Application Detail workspace is the central workflow view.

Implemented sections:

-   Application Header.
-   Job Description.
-   Analyze.
-   Research.
-   Documents.
-   Interviews.
-   Timeline.

Generation actions are implemented inside the existing Documents section rather
than as a standalone page or parallel document system.

The responsive workspace provides sticky in-page navigation with desktop
section controls and a compact mobile selector. Analyze and Research treat an
authoritative empty history as a normal empty state without requesting a
guaranteed-missing latest result.

------------------------------------------------------------------------

## Candidate Profile

Responsible for:

-   candidate information management;
-   skills;
-   education;
-   experience;
-   projects;
-   languages.

------------------------------------------------------------------------

## Document Workspace

Implemented document workflow:

-   document discovery;
-   document selection;
-   document creation;
-   metadata editing;
-   Markdown content editing;
-   version history;
-   version restoration.

The Document workspace is isolated from Application Detail state.

Its shared Document type contract includes `MARKDOWN_NOTE`, `COVER_LETTER`,
`APPLICATION_BRIEF`, and `INTERVIEW_BRIEF`. Human-readable labels are used in
normal UI. Manual creation remains available, while Generate adds Cover Letter
English/French, Application Brief, and Interview Brief choices. An existing
logical generated type is opened instead of knowingly submitting a duplicate.

Successful Generation responses are inserted directly into local Document
state, selected, and rendered without a follow-up Document detail request. The
existing editor owns source editing and a preview through the shared safe
`MarkdownContent` renderer. Edit and Preview use one full-width active pane at
all viewport sizes; existing content opens in Preview and blank content opens in
Edit without discarding an unsaved draft when toggled. Save, version history,
and restore continue to use the existing append-only Document operations.

Generated types expose Regenerate for the selected Document only. Cover Letter
requires a new explicit English/French choice; both briefs are fixed English.
While Regenerate is pending, the current version stays visible and editable.
Success applies the returned current version and triggers the existing history
refresh; failure preserves the prior selected content and history.

Generation warnings are shown outside document Markdown as concise limitations.
Raw warning enums and backend metadata are not displayed. Pending state disables
only Generation controls, and safe status-based errors never trigger automatic
retry. The Generate options, language controls, warnings, editor, and history
stack or wrap at phone/tablet breakpoints without introducing another store or
UI framework.

------------------------------------------------------------------------

# Component Architecture

The frontend uses standalone components.

Responsibilities are divided by feature ownership.

Example:

``` text
ApplicationDetail
        |
        +-- JobDescription
        |
        +-- ApplicationAnalysis
        |
        +-- ResearchSection
        |       |
        |       +-- ResearchResult
        |
        +-- ApplicationDocuments
                |
                +-- DocumentEditor
                        |
                        +-- DocumentVersionHistory
        |
        +-- Interviews
        |
        +-- Timeline
```

Parent components orchestrate composition.

Child components own their local UI state and workflows.

------------------------------------------------------------------------

# State Management

The frontend uses Angular Signals for local feature state.

Typical state ownership includes:

-   loading state;
-   selected entity;
-   editing state;
-   saving state;
-   validation errors;
-   success messages.

Feature components should own state only for the resources they manage.

------------------------------------------------------------------------

# Forms

Reactive Forms are used for editable workflows.

Implemented examples:

-   Application forms.
-   Job Description forms.
-   Interview forms.
-   Document metadata forms.
-   Document content forms.

Metadata and content updates are intentionally separated because they
map to different backend operations.

------------------------------------------------------------------------

# Backend Communication

Frontend services encapsulate API communication.

Responsibilities:

-   HTTP requests;
-   response mapping;
-   frontend model boundaries;
-   removal of backend-only fields.

Components should not directly perform HTTP operations.

------------------------------------------------------------------------

# AI Boundary

The frontend exposes implemented AI workflows without owning provider,
validation, confidence, prompt, or persistence logic.

Implemented AI capabilities:

-   Application analysis.
-   Research display.
-   Document Generate and Regenerate inside the Documents workspace.

------------------------------------------------------------------------

# Current Implementation Status

Implemented:

-   Candidate Profile UI.
-   Applications Dashboard.
-   Application Detail workspace.
-   Job Description UI.
-   Interview UI.
-   Timeline UI.
-   Document Workspace.
-   Document Editor.
-   Document Version History.
-   Analyze workflow UI.
-   Research workflow UI.
-   Research v1/v2 exact and range compensation rendering.
-   Completed sparse Research summaries and limitations without empty claim or
    source sections.
-   Generation choices, pending/error/warning states, direct result selection,
    Regenerate, and safe Markdown preview through the existing Documents UI.
-   Responsive in-page Application workspace navigation and normal
    Analyze/Research empty states.
-   One full-width Edit/Preview Document pane across desktop, tablet, and mobile.

The implemented frontend covers the complete local MVP workflow. Further UI
polish is outside the current scope.
