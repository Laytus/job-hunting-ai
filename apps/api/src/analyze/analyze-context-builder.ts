import type { Application } from '../application/application.types.js';
import type { CandidateAggregate } from '../candidate/candidate.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { AnalyzeContextError } from './analyze-context.errors.js';
import type { AnalyzeContext } from './analyze-context.types.js';

export interface AnalyzeContextSources {
  readonly candidate: CandidateAggregate | null | undefined;
  readonly application: Application | null | undefined;
  readonly jobDescription: JobDescription | null | undefined;
}

function nullable(value: string | null | undefined): string | null {
  return value ?? null;
}

function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function compareNullableDatesDescending(
  left: string | null,
  right: string | null,
): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }

  return compareStrings(right, left);
}

export class AnalyzeContextBuilder {
  build(sources: AnalyzeContextSources): AnalyzeContext {
    const { candidate, application, jobDescription } = sources;

    if (candidate == null) {
      throw new AnalyzeContextError('CANDIDATE_PROFILE_UNAVAILABLE');
    }
    if (application == null) {
      throw new AnalyzeContextError('APPLICATION_UNAVAILABLE');
    }
    if (jobDescription == null) {
      throw new AnalyzeContextError('JOB_DESCRIPTION_UNAVAILABLE');
    }
    if (jobDescription.applicationId !== application.id) {
      throw new AnalyzeContextError('INVALID_SOURCE_CONTEXT');
    }

    const experiences = [...candidate.experiences]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          compareStrings(right.startDate, left.startDate) ||
          compareStrings(left.id, right.id),
      )
      .map((experience) => ({
        organization: experience.organization,
        role: experience.role,
        location: nullable(experience.location),
        startDate: experience.startDate,
        endDate: nullable(experience.endDate),
        descriptionMarkdown: nullable(experience.descriptionMarkdown),
      }));

    const education = [...candidate.education]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          compareStrings(right.startDate, left.startDate) ||
          compareStrings(left.id, right.id),
      )
      .map((entry) => ({
        institution: entry.institution,
        degree: entry.degree,
        fieldOfStudy: nullable(entry.fieldOfStudy),
        location: nullable(entry.location),
        startDate: entry.startDate,
        endDate: nullable(entry.endDate),
        descriptionMarkdown: nullable(entry.descriptionMarkdown),
      }));

    const projects = [...candidate.projects]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          compareNullableDatesDescending(left.startDate, right.startDate) ||
          compareStrings(left.id, right.id),
      )
      .map((project) => ({
        name: project.name,
        role: nullable(project.role),
        descriptionMarkdown: nullable(project.descriptionMarkdown),
        startDate: nullable(project.startDate),
        endDate: nullable(project.endDate),
        technologies: [...project.technologies],
      }));

    const skills = [...candidate.skills]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          compareStrings(left.category, right.category) ||
          compareStrings(left.name, right.name) ||
          compareStrings(left.id, right.id),
      )
      .map((skill) => ({
        name: skill.name,
        category: skill.category,
        level: skill.level,
        notes: nullable(skill.notes),
      }));

    const languages = [...candidate.languages]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          compareStrings(left.language, right.language) ||
          compareStrings(left.id, right.id),
      )
      .map((language) => ({
        language: language.language,
        level: language.level,
        certification: nullable(language.certification),
        notes: nullable(language.notes),
      }));

    return {
      candidate: {
        fullName: candidate.fullName,
        headline: nullable(candidate.headline),
        summaryMarkdown: nullable(candidate.summaryMarkdown),
        location: nullable(candidate.location),
        targetRoles: [...candidate.targetRoles],
        targetLocations: [...candidate.targetLocations],
        careerGoalsMarkdown: nullable(candidate.careerGoalsMarkdown),
        cvMarkdown: nullable(candidate.cvMarkdown),
        additionalContext: nullable(candidate.additionalContext),
        experiences,
        education,
        projects,
        skills,
        languages,
      },
      application: {
        companyName: application.companyName,
        roleTitle: application.roleTitle,
        location: nullable(application.location),
        source: application.source,
        jobUrl: nullable(application.jobUrl),
      },
      jobDescription: {
        title: nullable(jobDescription.title),
        companyName: nullable(jobDescription.companyName),
        descriptionMarkdown: jobDescription.descriptionMarkdown,
        requirementsMarkdown: nullable(jobDescription.requirementsMarkdown),
        responsibilitiesMarkdown: nullable(
          jobDescription.responsibilitiesMarkdown,
        ),
        sourceUrl: nullable(jobDescription.sourceUrl),
      },
    };
  }
}
