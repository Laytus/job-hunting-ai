import type { HttpMappableDomainError } from '../http/errors.js';

export type AnalyzeContextErrorCode =
  | 'CANDIDATE_PROFILE_UNAVAILABLE'
  | 'APPLICATION_UNAVAILABLE'
  | 'JOB_DESCRIPTION_UNAVAILABLE'
  | 'INVALID_SOURCE_CONTEXT';

const messages: Record<AnalyzeContextErrorCode, string> = {
  CANDIDATE_PROFILE_UNAVAILABLE:
    'A Candidate Profile is required to analyze an Application.',
  APPLICATION_UNAVAILABLE: 'An Application is required for analysis.',
  JOB_DESCRIPTION_UNAVAILABLE:
    'A Job Description is required to analyze an Application.',
  INVALID_SOURCE_CONTEXT: 'The Analyze source context is inconsistent.',
};

export class AnalyzeContextError
  extends Error
  implements HttpMappableDomainError
{
  readonly httpMapping: HttpMappableDomainError['httpMapping'];

  constructor(readonly code: AnalyzeContextErrorCode) {
    super(messages[code]);
    this.name = new.target.name;
    this.httpMapping = {
      statusCode: 409,
      code,
      safeMessage: messages[code],
    };
  }
}
