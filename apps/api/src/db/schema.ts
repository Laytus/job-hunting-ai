import { sql } from 'drizzle-orm';
import type { AnalyzeOutput } from '../analyze/analyze.schema.js';
import {
  type AnyPgColumn,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const applicationStatus = pgEnum('application_status', [
  'FOUND',
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
]);

export const applicationPriority = pgEnum('application_priority', [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

export const applicationSource = pgEnum('application_source', [
  'CAREER_PAGE',
  'LINKEDIN',
  'REFERRAL',
  'RECRUITER',
  'OTHER',
]);

export const applicationEventType = pgEnum('application_event_type', [
  'APPLICATION_CREATED',
  'APPLICATION_UPDATED',
  'APPLICATION_STATUS_CHANGED',
  'JOB_DESCRIPTION_CREATED',
  'JOB_DESCRIPTION_UPDATED',
  'INTERVIEW_CREATED',
  'INTERVIEW_UPDATED',
]);

export const jobAnalysisStatus = pgEnum('job_analysis_status', [
  'RUNNING',
  'COMPLETED',
  'FAILED',
]);

export const researchStatus = pgEnum('research_status', [
  'RUNNING',
  'COMPLETED',
  'FAILED',
]);

export const researchSourceType = pgEnum('research_source_type', [
  'OFFICIAL',
  'NEWS',
  'SALARY_DATABASE',
  'INTERVIEW_REPORT',
  'FORUM',
  'OTHER',
]);

export const researchSourceQuality = pgEnum('research_source_quality', [
  'HIGH',
  'MEDIUM',
  'LOW',
]);

export const researchClaimType = pgEnum('research_claim_type', [
  'COMPANY_DESCRIPTION',
  'BUSINESS_AREA',
  'PARIS_PRESENCE',
  'ROLE_INFORMATION',
  'SALARY_BASE',
  'TOTAL_COMPENSATION',
  'INTERVIEW_STAGE',
  'INTERVIEW_TOPIC',
  'TECHNOLOGY',
  'CULTURE',
  'OTHER',
]);

export const researchEvidenceType = pgEnum('research_evidence_type', [
  'FACT',
  'REPORTED',
  'INFERRED',
]);

export const researchConfidence = pgEnum('research_confidence', [
  'LOW',
  'MEDIUM',
  'HIGH',
]);

export const researchClaimSourceRelationship = pgEnum(
  'research_claim_source_relationship',
  ['SUPPORTS', 'CONTRADICTS'],
);

export const applications = pgTable(
  'applications',
  {
    id: uuid().primaryKey().defaultRandom(),
    companyName: text('company_name').notNull(),
    roleTitle: text('role_title').notNull(),
    location: text(),
    jobUrl: text('job_url'),
    source: applicationSource().notNull(),
    status: applicationStatus().notNull(),
    priority: applicationPriority().notNull(),
    dateFound: date('date_found'),
    dateApplied: date('date_applied'),
    notesMarkdown: text('notes_markdown'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('applications_company_name_not_blank', sql`btrim(${table.companyName}) <> ''`),
    check('applications_role_title_not_blank', sql`btrim(${table.roleTitle}) <> ''`),
    check(
      'applications_date_range',
      sql`${table.dateApplied} IS NULL OR ${table.dateFound} IS NULL OR ${table.dateApplied} >= ${table.dateFound}`,
    ),
  ],
);

export const applicationEvents = pgTable(
  'application_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    applicationId: uuid('application_id').notNull(),
    type: applicationEventType().notNull(),
    title: text().notNull(),
    description: text().notNull(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('application_events_title_not_blank', sql`btrim(${table.title}) <> ''`),
    check(
      'application_events_description_not_blank',
      sql`btrim(${table.description}) <> ''`,
    ),
    check(
      'application_events_metadata_object',
      sql`${table.metadata} IS NULL OR jsonb_typeof(${table.metadata}) = 'object'`,
    ),
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [applications.id],
      name: 'application_events_application_fk',
    }).onDelete('cascade'),
    index('application_events_application_order_idx').on(
      table.applicationId,
      table.occurredAt.desc(),
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const jobDescriptions = pgTable(
  'job_descriptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    applicationId: uuid('application_id').notNull(),
    title: text(),
    companyName: text('company_name'),
    descriptionMarkdown: text('description_markdown').notNull(),
    requirementsMarkdown: text('requirements_markdown'),
    responsibilitiesMarkdown: text('responsibilities_markdown'),
    structuredData: jsonb('structured_data').$type<Record<string, unknown>>(),
    sourceUrl: text('source_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'job_descriptions_description_markdown_not_blank',
      sql`btrim(${table.descriptionMarkdown}) <> ''`,
    ),
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [applications.id],
      name: 'job_descriptions_application_fk',
    }).onDelete('cascade'),
    uniqueIndex('job_descriptions_application_uq').on(table.applicationId),
  ],
);

export const jobAnalyses = pgTable(
  'job_analyses',
  {
    id: uuid().primaryKey().defaultRandom(),
    applicationId: uuid('application_id').notNull(),
    status: jobAnalysisStatus().notNull(),
    analysisData: jsonb('analysis_data').$type<AnalyzeOutput>(),
    suggestedScore: integer('suggested_score'),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    promptVersion: text('prompt_version').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'job_analyses_analysis_data_object',
      sql`${table.analysisData} IS NULL OR jsonb_typeof(${table.analysisData}) = 'object'`,
    ),
    check(
      'job_analyses_suggested_score_range',
      sql`${table.suggestedScore} IS NULL OR (${table.suggestedScore} >= 0 AND ${table.suggestedScore} <= 100)`,
    ),
    check(
      'job_analyses_prompt_version_not_blank',
      sql`btrim(${table.promptVersion}) <> ''`,
    ),
    check(
      'job_analyses_failure_code_not_blank',
      sql`${table.failureCode} IS NULL OR btrim(${table.failureCode}) <> ''`,
    ),
    check(
      'job_analyses_failure_message_not_blank',
      sql`${table.failureMessage} IS NULL OR btrim(${table.failureMessage}) <> ''`,
    ),
    check(
      'job_analyses_terminal_timestamp_order',
      sql`(${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}) AND (${table.failedAt} IS NULL OR ${table.failedAt} >= ${table.startedAt})`,
    ),
    check(
      'job_analyses_state_consistency',
      sql`(
        (${table.status} = 'RUNNING' AND ${table.analysisData} IS NULL AND ${table.suggestedScore} IS NULL AND ${table.failureCode} IS NULL AND ${table.failureMessage} IS NULL AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NULL)
        OR
        (${table.status} = 'COMPLETED' AND ${table.analysisData} IS NOT NULL AND ${table.failureCode} IS NULL AND ${table.failureMessage} IS NULL AND ${table.completedAt} IS NOT NULL AND ${table.failedAt} IS NULL)
        OR
        (${table.status} = 'FAILED' AND ${table.analysisData} IS NULL AND ${table.suggestedScore} IS NULL AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NOT NULL)
      )`,
    ),
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [applications.id],
      name: 'job_analyses_application_fk',
    }).onDelete('cascade'),
    uniqueIndex('job_analyses_application_running_uq')
      .on(table.applicationId)
      .where(sql`${table.status} = 'RUNNING'`),
    index('job_analyses_application_history_idx').on(
      table.applicationId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('job_analyses_application_status_history_idx').on(
      table.applicationId,
      table.status,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const researches = pgTable(
  'researches',
  {
    id: uuid().primaryKey().defaultRandom(),
    applicationId: uuid('application_id').notNull(),
    status: researchStatus().notNull(),
    summaryMarkdown: text('summary_markdown'),
    warnings: jsonb()
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    promptVersion: text('prompt_version'),
    researchDate: timestamp('research_date', { withTimezone: true }).notNull(),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('researches_warnings_array', sql`jsonb_typeof(${table.warnings}) = 'array'`),
    check(
      'researches_prompt_version_not_blank',
      sql`${table.promptVersion} IS NULL OR btrim(${table.promptVersion}) <> ''`,
    ),
    check(
      'researches_failure_code_not_blank',
      sql`${table.failureCode} IS NULL OR btrim(${table.failureCode}) <> ''`,
    ),
    check(
      'researches_failure_message_not_blank',
      sql`${table.failureMessage} IS NULL OR btrim(${table.failureMessage}) <> ''`,
    ),
    check(
      'researches_terminal_timestamp_order',
      sql`(${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}) AND (${table.failedAt} IS NULL OR ${table.failedAt} >= ${table.startedAt})`,
    ),
    check(
      'researches_state_consistency',
      sql`(
        (${table.status} = 'RUNNING' AND ${table.summaryMarkdown} IS NULL AND ${table.failureCode} IS NULL AND ${table.failureMessage} IS NULL AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NULL)
        OR
        (${table.status} = 'COMPLETED' AND ${table.failureCode} IS NULL AND ${table.failureMessage} IS NULL AND ${table.completedAt} IS NOT NULL AND ${table.failedAt} IS NULL)
        OR
        (${table.status} = 'FAILED' AND ${table.summaryMarkdown} IS NULL AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NOT NULL)
      )`,
    ),
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [applications.id],
      name: 'researches_application_fk',
    }).onDelete('cascade'),
    uniqueIndex('researches_application_running_uq')
      .on(table.applicationId)
      .where(sql`${table.status} = 'RUNNING'`),
    index('researches_application_history_idx').on(
      table.applicationId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('researches_application_status_history_idx').on(
      table.applicationId,
      table.status,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const researchSources = pgTable(
  'research_sources',
  {
    id: uuid().primaryKey().defaultRandom(),
    researchId: uuid('research_id').notNull(),
    url: text().notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    title: text(),
    publisher: text(),
    sourceType: researchSourceType('source_type').notNull(),
    sourceQuality: researchSourceQuality('source_quality').notNull(),
    publishedAt: date('published_at'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull(),
    notes: text(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('research_sources_url_not_blank', sql`btrim(${table.url}) <> ''`),
    check(
      'research_sources_normalized_url_not_blank',
      sql`btrim(${table.normalizedUrl}) <> ''`,
    ),
    foreignKey({
      columns: [table.researchId],
      foreignColumns: [researches.id],
      name: 'research_sources_research_fk',
    }).onDelete('cascade'),
    uniqueIndex('research_sources_research_id_id_uq').on(table.researchId, table.id),
    uniqueIndex('research_sources_research_normalized_url_uq').on(
      table.researchId,
      table.normalizedUrl,
    ),
  ],
);

export const researchClaims = pgTable(
  'research_claims',
  {
    id: uuid().primaryKey().defaultRandom(),
    researchId: uuid('research_id').notNull(),
    type: researchClaimType().notNull(),
    valueText: text('value_text'),
    valueJson: jsonb('value_json').$type<Readonly<Record<string, unknown>>>(),
    evidenceType: researchEvidenceType('evidence_type').notNull(),
    confidence: researchConfidence().notNull(),
    notes: text(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'research_claims_value_required',
      sql`${table.valueText} IS NOT NULL OR ${table.valueJson} IS NOT NULL`,
    ),
    foreignKey({
      columns: [table.researchId],
      foreignColumns: [researches.id],
      name: 'research_claims_research_fk',
    }).onDelete('cascade'),
    uniqueIndex('research_claims_research_id_id_uq').on(table.researchId, table.id),
  ],
);

export const researchClaimSources = pgTable(
  'research_claim_sources',
  {
    researchId: uuid('research_id').notNull(),
    claimId: uuid('claim_id').notNull(),
    sourceId: uuid('source_id').notNull(),
    relationship: researchClaimSourceRelationship().notNull(),
    evidenceText: text('evidence_text').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.claimId, table.sourceId],
      name: 'research_claim_sources_pk',
    }),
    foreignKey({
      columns: [table.researchId, table.claimId],
      foreignColumns: [researchClaims.researchId, researchClaims.id],
      name: 'research_claim_sources_claim_ownership_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.researchId, table.sourceId],
      foreignColumns: [researchSources.researchId, researchSources.id],
      name: 'research_claim_sources_source_ownership_fk',
    }).onDelete('cascade'),
    index('research_claim_sources_research_idx').on(table.researchId),
    index('research_claim_sources_source_idx').on(table.sourceId),
  ],
);

export const interviewType = pgEnum('interview_type', [
  'RECRUITER',
  'HR',
  'TECHNICAL',
  'SYSTEM_DESIGN',
  'BEHAVIORAL',
  'FINAL',
  'OTHER',
]);

export const interviewStatus = pgEnum('interview_status', [
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'RESCHEDULED',
]);

export const interviews = pgTable(
  'interviews',
  {
    id: uuid().primaryKey().defaultRandom(),
    applicationId: uuid('application_id').notNull(),
    type: interviewType().notNull(),
    status: interviewStatus().notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    notesMarkdown: text('notes_markdown'),
    feedbackMarkdown: text('feedback_markdown'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'interviews_timestamp_order',
      sql`${table.completedAt} IS NULL OR ${table.scheduledAt} IS NULL OR ${table.completedAt} >= ${table.scheduledAt}`,
    ),
    check('interviews_sort_order_non_negative', sql`${table.sortOrder} >= 0`),
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [applications.id],
      name: 'interviews_application_fk',
    }).onDelete('cascade'),
    index('interviews_application_order_idx').on(
      table.applicationId,
      table.sortOrder,
      table.scheduledAt.asc().nullsLast(),
      table.createdAt,
      table.id,
    ),
  ],
);

export const candidateSkillCategory = pgEnum('candidate_skill_category', [
  'PROGRAMMING_LANGUAGE',
  'FRAMEWORK',
  'LIBRARY',
  'DATABASE',
  'CLOUD',
  'DEVOPS',
  'TOOL',
  'METHODOLOGY',
  'DOMAIN',
  'SOFT_SKILL',
  'OTHER',
]);

export const candidateSkillLevel = pgEnum('candidate_skill_level', [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
  'EXPERT',
]);

export const candidateProfiles = pgTable(
  'candidate_profiles',
  {
    id: uuid().primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    headline: text(),
    summaryMarkdown: text('summary_markdown'),
    linkedinUrl: text('linkedin_url'),
    githubUrl: text('github_url'),
    portfolioUrl: text('portfolio_url'),
    location: text(),
    targetRoles: jsonb('target_roles').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    targetLocations: jsonb('target_locations')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    careerGoalsMarkdown: text('career_goals_markdown'),
    cvMarkdown: text('cv_markdown'),
    additionalContext: text('additional_context'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('candidate_profiles_full_name_not_blank', sql`btrim(${table.fullName}) <> ''`),
    check(
      'candidate_profiles_target_roles_array',
      sql`jsonb_typeof(${table.targetRoles}) = 'array'`,
    ),
    check(
      'candidate_profiles_target_locations_array',
      sql`jsonb_typeof(${table.targetLocations}) = 'array'`,
    ),
  ],
);

export const candidateExperiences = pgTable(
  'candidate_experiences',
  {
    id: uuid().primaryKey().defaultRandom(),
    candidateProfileId: uuid('candidate_profile_id').notNull(),
    organization: text().notNull(),
    role: text().notNull(),
    location: text(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    descriptionMarkdown: text('description_markdown'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'candidate_experiences_organization_not_blank',
      sql`btrim(${table.organization}) <> ''`,
    ),
    check('candidate_experiences_role_not_blank', sql`btrim(${table.role}) <> ''`),
    check(
      'candidate_experiences_date_range',
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    check('candidate_experiences_sort_order_non_negative', sql`${table.sortOrder} >= 0`),
    foreignKey({
      columns: [table.candidateProfileId],
      foreignColumns: [candidateProfiles.id],
      name: 'candidate_experiences_profile_fk',
    }).onDelete('cascade'),
    index('candidate_experiences_profile_order_idx').on(
      table.candidateProfileId,
      table.sortOrder,
      table.startDate.desc(),
      table.id,
    ),
  ],
);

export const candidateEducation = pgTable(
  'candidate_education',
  {
    id: uuid().primaryKey().defaultRandom(),
    candidateProfileId: uuid('candidate_profile_id').notNull(),
    institution: text().notNull(),
    degree: text().notNull(),
    fieldOfStudy: text('field_of_study'),
    location: text(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    descriptionMarkdown: text('description_markdown'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'candidate_education_institution_not_blank',
      sql`btrim(${table.institution}) <> ''`,
    ),
    check('candidate_education_degree_not_blank', sql`btrim(${table.degree}) <> ''`),
    check(
      'candidate_education_date_range',
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    check('candidate_education_sort_order_non_negative', sql`${table.sortOrder} >= 0`),
    foreignKey({
      columns: [table.candidateProfileId],
      foreignColumns: [candidateProfiles.id],
      name: 'candidate_education_profile_fk',
    }).onDelete('cascade'),
    index('candidate_education_profile_order_idx').on(
      table.candidateProfileId,
      table.sortOrder,
      table.startDate.desc(),
      table.id,
    ),
  ],
);

export const candidateProjects = pgTable(
  'candidate_projects',
  {
    id: uuid().primaryKey().defaultRandom(),
    candidateProfileId: uuid('candidate_profile_id').notNull(),
    name: text().notNull(),
    role: text(),
    descriptionMarkdown: text('description_markdown'),
    projectUrl: text('project_url'),
    repositoryUrl: text('repository_url'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    technologiesJson: jsonb('technologies_json')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('candidate_projects_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check(
      'candidate_projects_date_range',
      sql`${table.startDate} IS NULL OR ${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      'candidate_projects_technologies_array',
      sql`jsonb_typeof(${table.technologiesJson}) = 'array'`,
    ),
    check('candidate_projects_sort_order_non_negative', sql`${table.sortOrder} >= 0`),
    foreignKey({
      columns: [table.candidateProfileId],
      foreignColumns: [candidateProfiles.id],
      name: 'candidate_projects_profile_fk',
    }).onDelete('cascade'),
    index('candidate_projects_profile_order_idx').on(
      table.candidateProfileId,
      table.sortOrder,
      table.startDate.desc().nullsLast(),
      table.id,
    ),
  ],
);

export const candidateSkills = pgTable(
  'candidate_skills',
  {
    id: uuid().primaryKey().defaultRandom(),
    candidateProfileId: uuid('candidate_profile_id').notNull(),
    name: text().notNull(),
    category: candidateSkillCategory().notNull(),
    level: candidateSkillLevel(),
    notes: text(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('candidate_skills_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check('candidate_skills_sort_order_non_negative', sql`${table.sortOrder} >= 0`),
    foreignKey({
      columns: [table.candidateProfileId],
      foreignColumns: [candidateProfiles.id],
      name: 'candidate_skills_profile_fk',
    }).onDelete('cascade'),
    uniqueIndex('candidate_skills_profile_name_uq').on(
      table.candidateProfileId,
      sql`lower(btrim(${table.name}))`,
    ),
    index('candidate_skills_profile_order_idx').on(
      table.candidateProfileId,
      table.sortOrder,
      table.category,
      table.id,
    ),
  ],
);

export const candidateLanguages = pgTable(
  'candidate_languages',
  {
    id: uuid().primaryKey().defaultRandom(),
    candidateProfileId: uuid('candidate_profile_id').notNull(),
    language: text().notNull(),
    level: text().notNull(),
    certification: text(),
    notes: text(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('candidate_languages_language_not_blank', sql`btrim(${table.language}) <> ''`),
    check('candidate_languages_level_not_blank', sql`btrim(${table.level}) <> ''`),
    check('candidate_languages_sort_order_non_negative', sql`${table.sortOrder} >= 0`),
    foreignKey({
      columns: [table.candidateProfileId],
      foreignColumns: [candidateProfiles.id],
      name: 'candidate_languages_profile_fk',
    }).onDelete('cascade'),
    uniqueIndex('candidate_languages_profile_language_uq').on(
      table.candidateProfileId,
      sql`lower(btrim(${table.language}))`,
    ),
    index('candidate_languages_profile_order_idx').on(
      table.candidateProfileId,
      table.sortOrder,
      table.language,
      table.id,
    ),
  ],
);

export const documentType = pgEnum('document_type', [
  'MARKDOWN_NOTE',
  'COVER_LETTER',
  'APPLICATION_BRIEF',
  'INTERVIEW_BRIEF',
]);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid().primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references((): AnyPgColumn => documents.id, { onDelete: 'cascade' }),
    contentMarkdown: text('content_markdown').notNull(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'document_versions_content_markdown_not_blank',
      sql`btrim(${table.contentMarkdown}) <> ''`,
    ),
    check(
      'document_versions_metadata_object',
      sql`${table.metadata} IS NULL OR jsonb_typeof(${table.metadata}) = 'object'`,
    ),
    uniqueIndex('document_versions_document_id_id_uq').on(
      table.documentId,
      table.id,
    ),
    index('document_versions_document_history_idx').on(
      table.documentId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: uuid().primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id'),
    applicationId: uuid('application_id'),
    type: documentType().notNull(),
    title: text().notNull(),
    currentVersionId: uuid('current_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'documents_exactly_one_owner',
      sql`num_nonnulls(${table.candidateId}, ${table.applicationId}) = 1`,
    ),
    check('documents_title_not_blank', sql`btrim(${table.title}) <> ''`),
    foreignKey({
      columns: [table.candidateId],
      foreignColumns: [candidateProfiles.id],
      name: 'documents_candidate_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [applications.id],
      name: 'documents_application_fk',
    }).onDelete('cascade'),
    // Drizzle cannot model FK deferrability; the migration declares this
    // DEFERRABLE INITIALLY DEFERRED for atomic aggregate creation/deletion.
    foreignKey({
      columns: [table.id, table.currentVersionId],
      foreignColumns: [documentVersions.documentId, documentVersions.id],
      name: 'documents_current_version_fk',
    }),
    index('documents_candidate_idx').on(table.candidateId),
    index('documents_application_idx').on(table.applicationId),
  ],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid().primaryKey().defaultRandom(),
    operationName: text('operation_name').notNull(),
    model: text().notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('ai_usage_operation_name_not_blank', sql`btrim(${table.operationName}) <> ''`),
    check('ai_usage_model_not_blank', sql`btrim(${table.model}) <> ''`),
    check('ai_usage_input_tokens_non_negative', sql`${table.inputTokens} >= 0`),
    check('ai_usage_output_tokens_non_negative', sql`${table.outputTokens} >= 0`),
    check('ai_usage_total_tokens_non_negative', sql`${table.totalTokens} >= 0`),
    index('ai_usage_operation_name_idx').on(table.operationName),
  ],
);
