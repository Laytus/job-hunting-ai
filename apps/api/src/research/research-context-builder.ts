import type { Application } from '../application/application.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { ResearchContextError } from './research-context.errors.js';
import type { ResearchContext } from './research-context.types.js';

export interface ResearchContextSources {
  readonly application: Application | null | undefined;
  readonly jobDescription: JobDescription | null | undefined;
}

function nullable(value: string | null | undefined): string | null {
  return value ?? null;
}

export class ResearchContextBuilder {
  build(sources: ResearchContextSources): ResearchContext {
    const { application, jobDescription } = sources;

    if (application == null) {
      throw new ResearchContextError('APPLICATION_UNAVAILABLE');
    }
    if (jobDescription == null) {
      throw new ResearchContextError('JOB_DESCRIPTION_UNAVAILABLE');
    }
    if (jobDescription.applicationId !== application.id) {
      throw new ResearchContextError('INVALID_SOURCE_CONTEXT');
    }

    return {
      application: {
        companyName: application.companyName,
        roleTitle: application.roleTitle,
        location: nullable(application.location),
        jobUrl: nullable(application.jobUrl),
        source: application.source,
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
