import type { FastifyPluginAsync } from 'fastify';
import { candidateResponseSchema, updateCandidateRequestSchema } from './candidate.schemas.js';
import type {
  CandidateProfileService,
  CandidateReplacementResult,
  CandidateWithContext,
} from './candidate.service.js';
import type { CandidateAggregate, CandidateReplacementCommand } from './candidate.types.js';

export type CandidateService = Pick<
  CandidateProfileService,
  'getCandidate' | 'replaceCandidate'
>;

export interface CandidateRoutesOptions {
  readonly resolveCandidateService: () => CandidateService;
}

function serializeCandidate(
  candidate: CandidateAggregate,
  candidateContextUpdatedAt: Date,
) {
  return {
    id: candidate.id,
    fullName: candidate.fullName,
    headline: candidate.headline,
    summaryMarkdown: candidate.summaryMarkdown,
    linkedinUrl: candidate.linkedinUrl,
    githubUrl: candidate.githubUrl,
    portfolioUrl: candidate.portfolioUrl,
    location: candidate.location,
    targetRoles: [...candidate.targetRoles],
    targetLocations: [...candidate.targetLocations],
    careerGoalsMarkdown: candidate.careerGoalsMarkdown,
    cvMarkdown: candidate.cvMarkdown,
    additionalContext: candidate.additionalContext,
    experiences: candidate.experiences.map((experience) => ({
      id: experience.id,
      organization: experience.organization,
      role: experience.role,
      location: experience.location,
      startDate: experience.startDate,
      endDate: experience.endDate,
      descriptionMarkdown: experience.descriptionMarkdown,
      sortOrder: experience.sortOrder,
      createdAt: experience.createdAt.toISOString(),
      updatedAt: experience.updatedAt.toISOString(),
    })),
    education: candidate.education.map((education) => ({
      id: education.id,
      institution: education.institution,
      degree: education.degree,
      fieldOfStudy: education.fieldOfStudy,
      location: education.location,
      startDate: education.startDate,
      endDate: education.endDate,
      descriptionMarkdown: education.descriptionMarkdown,
      sortOrder: education.sortOrder,
      createdAt: education.createdAt.toISOString(),
      updatedAt: education.updatedAt.toISOString(),
    })),
    projects: candidate.projects.map((project) => ({
      id: project.id,
      name: project.name,
      role: project.role,
      descriptionMarkdown: project.descriptionMarkdown,
      projectUrl: project.projectUrl,
      repositoryUrl: project.repositoryUrl,
      startDate: project.startDate,
      endDate: project.endDate,
      technologies: [...project.technologies],
      sortOrder: project.sortOrder,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    })),
    skills: candidate.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      level: skill.level,
      notes: skill.notes,
      sortOrder: skill.sortOrder,
      createdAt: skill.createdAt.toISOString(),
      updatedAt: skill.updatedAt.toISOString(),
    })),
    languages: candidate.languages.map((language) => ({
      id: language.id,
      language: language.language,
      level: language.level,
      certification: language.certification,
      notes: language.notes,
      sortOrder: language.sortOrder,
      createdAt: language.createdAt.toISOString(),
      updatedAt: language.updatedAt.toISOString(),
    })),
    candidateContextUpdatedAt: candidateContextUpdatedAt.toISOString(),
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

function serializeGetCandidate(candidate: CandidateWithContext | null) {
  return {
    candidate:
      candidate === null
        ? null
        : serializeCandidate(candidate, candidate.candidateContextUpdatedAt),
  };
}

function serializeCandidateReplacement(result: CandidateReplacementResult) {
  return {
    candidate: serializeCandidate(result.candidate, result.candidateContextUpdatedAt),
  };
}

export const candidateRoutes: FastifyPluginAsync<CandidateRoutesOptions> = async (
  app,
  options,
) => {
  app.get(
    '/candidate',
    {
      schema: {
        response: {
          200: candidateResponseSchema,
        },
      },
    },
    async () => {
      const candidate = await options.resolveCandidateService().getCandidate();
      return serializeGetCandidate(candidate);
    },
  );

  app.put<{ Body: CandidateReplacementCommand }>(
    '/candidate',
    {
      schema: {
        body: updateCandidateRequestSchema,
        response: {
          200: candidateResponseSchema,
          201: candidateResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await options.resolveCandidateService().replaceCandidate(request.body);
      if (result.created) {
        reply.status(201).header('Location', '/api/v1/candidate');
      }
      return reply.send(serializeCandidateReplacement(result));
    },
  );
};
