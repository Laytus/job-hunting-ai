import { candidateSkillCategories, candidateSkillLevels } from './candidate.types.js';

const nonEmptyString = {
  type: 'string',
  minLength: 1,
  pattern: '\\S',
} as const;

const nullableNonEmptyString = {
  anyOf: [nonEmptyString, { type: 'null' }],
} as const;

const uuid = {
  type: 'string',
  format: 'uuid',
} as const;

const date = {
  type: 'string',
  format: 'date',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
} as const;

const nullableDate = {
  anyOf: [date, { type: 'null' }],
} as const;

const timestamp = {
  type: 'string',
  format: 'date-time',
} as const;

const httpUrl = {
  type: 'string',
  minLength: 1,
  format: 'uri',
  pattern: '^[hH][tT][tT][pP][sS]?://',
} as const;

const nullableHttpUrl = {
  anyOf: [httpUrl, { type: 'null' }],
} as const;

const nonNegativeInteger = {
  type: 'integer',
  minimum: 0,
} as const;

const stringArray = {
  type: 'array',
  items: nonEmptyString,
} as const;

const candidateExperienceInput = {
  type: 'object',
  additionalProperties: false,
  required: [
    'organization',
    'role',
    'location',
    'startDate',
    'endDate',
    'descriptionMarkdown',
    'sortOrder',
  ],
  properties: {
    id: uuid,
    organization: nonEmptyString,
    role: nonEmptyString,
    location: nullableNonEmptyString,
    startDate: date,
    endDate: nullableDate,
    descriptionMarkdown: nullableNonEmptyString,
    sortOrder: nonNegativeInteger,
  },
} as const;

const candidateEducationInput = {
  type: 'object',
  additionalProperties: false,
  required: [
    'institution',
    'degree',
    'fieldOfStudy',
    'location',
    'startDate',
    'endDate',
    'descriptionMarkdown',
    'sortOrder',
  ],
  properties: {
    id: uuid,
    institution: nonEmptyString,
    degree: nonEmptyString,
    fieldOfStudy: nullableNonEmptyString,
    location: nullableNonEmptyString,
    startDate: date,
    endDate: nullableDate,
    descriptionMarkdown: nullableNonEmptyString,
    sortOrder: nonNegativeInteger,
  },
} as const;

const candidateProjectInput = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'role',
    'descriptionMarkdown',
    'projectUrl',
    'repositoryUrl',
    'startDate',
    'endDate',
    'technologies',
    'sortOrder',
  ],
  properties: {
    id: uuid,
    name: nonEmptyString,
    role: nullableNonEmptyString,
    descriptionMarkdown: nullableNonEmptyString,
    projectUrl: nullableHttpUrl,
    repositoryUrl: nullableHttpUrl,
    startDate: nullableDate,
    endDate: nullableDate,
    technologies: stringArray,
    sortOrder: nonNegativeInteger,
  },
} as const;

const candidateSkillInput = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'category', 'level', 'notes', 'sortOrder'],
  properties: {
    id: uuid,
    name: nonEmptyString,
    category: { type: 'string', enum: candidateSkillCategories },
    level: {
      anyOf: [{ type: 'string', enum: candidateSkillLevels }, { type: 'null' }],
    },
    notes: nullableNonEmptyString,
    sortOrder: nonNegativeInteger,
  },
} as const;

const candidateLanguageInput = {
  type: 'object',
  additionalProperties: false,
  required: ['language', 'level', 'certification', 'notes', 'sortOrder'],
  properties: {
    id: uuid,
    language: nonEmptyString,
    level: nonEmptyString,
    certification: nullableNonEmptyString,
    notes: nullableNonEmptyString,
    sortOrder: nonNegativeInteger,
  },
} as const;

export const updateCandidateRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'fullName',
    'headline',
    'summaryMarkdown',
    'linkedinUrl',
    'githubUrl',
    'portfolioUrl',
    'location',
    'targetRoles',
    'targetLocations',
    'careerGoalsMarkdown',
    'cvMarkdown',
    'additionalContext',
    'experiences',
    'education',
    'projects',
    'skills',
    'languages',
  ],
  properties: {
    fullName: nonEmptyString,
    headline: nullableNonEmptyString,
    summaryMarkdown: nullableNonEmptyString,
    linkedinUrl: nullableHttpUrl,
    githubUrl: nullableHttpUrl,
    portfolioUrl: nullableHttpUrl,
    location: nullableNonEmptyString,
    targetRoles: stringArray,
    targetLocations: stringArray,
    careerGoalsMarkdown: nullableNonEmptyString,
    cvMarkdown: nullableNonEmptyString,
    additionalContext: nullableNonEmptyString,
    experiences: { type: 'array', items: candidateExperienceInput },
    education: { type: 'array', items: candidateEducationInput },
    projects: { type: 'array', items: candidateProjectInput },
    skills: { type: 'array', items: candidateSkillInput },
    languages: { type: 'array', items: candidateLanguageInput },
  },
} as const;

function responseChild(properties: Record<string, unknown>, required: readonly string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...required, 'id', 'createdAt', 'updatedAt'],
    properties: {
      id: uuid,
      ...properties,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  } as const;
}

const candidateExperienceResponse = responseChild(candidateExperienceInput.properties, [
  'organization',
  'role',
  'location',
  'startDate',
  'endDate',
  'descriptionMarkdown',
  'sortOrder',
]);

const candidateEducationResponse = responseChild(candidateEducationInput.properties, [
  'institution',
  'degree',
  'fieldOfStudy',
  'location',
  'startDate',
  'endDate',
  'descriptionMarkdown',
  'sortOrder',
]);

const candidateProjectResponse = responseChild(candidateProjectInput.properties, [
  'name',
  'role',
  'descriptionMarkdown',
  'projectUrl',
  'repositoryUrl',
  'startDate',
  'endDate',
  'technologies',
  'sortOrder',
]);

const candidateSkillResponse = responseChild(candidateSkillInput.properties, [
  'name',
  'category',
  'level',
  'notes',
  'sortOrder',
]);

const candidateLanguageResponse = responseChild(candidateLanguageInput.properties, [
  'language',
  'level',
  'certification',
  'notes',
  'sortOrder',
]);

const candidateResponse = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'fullName',
    'headline',
    'summaryMarkdown',
    'linkedinUrl',
    'githubUrl',
    'portfolioUrl',
    'location',
    'targetRoles',
    'targetLocations',
    'careerGoalsMarkdown',
    'cvMarkdown',
    'additionalContext',
    'experiences',
    'education',
    'projects',
    'skills',
    'languages',
    'candidateContextUpdatedAt',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: uuid,
    fullName: nonEmptyString,
    headline: nullableNonEmptyString,
    summaryMarkdown: nullableNonEmptyString,
    linkedinUrl: nullableHttpUrl,
    githubUrl: nullableHttpUrl,
    portfolioUrl: nullableHttpUrl,
    location: nullableNonEmptyString,
    targetRoles: stringArray,
    targetLocations: stringArray,
    careerGoalsMarkdown: nullableNonEmptyString,
    cvMarkdown: nullableNonEmptyString,
    additionalContext: nullableNonEmptyString,
    experiences: { type: 'array', items: candidateExperienceResponse },
    education: { type: 'array', items: candidateEducationResponse },
    projects: { type: 'array', items: candidateProjectResponse },
    skills: { type: 'array', items: candidateSkillResponse },
    languages: { type: 'array', items: candidateLanguageResponse },
    candidateContextUpdatedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
} as const;

export const candidateResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['candidate'],
  properties: {
    candidate: {
      anyOf: [{ type: 'null' }, candidateResponse],
    },
  },
} as const;
