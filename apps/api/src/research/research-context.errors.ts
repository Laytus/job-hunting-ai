import type { HttpMappableDomainError } from '../http/errors.js';

export type ResearchContextErrorCode =
  | 'APPLICATION_UNAVAILABLE'
  | 'JOB_DESCRIPTION_UNAVAILABLE'
  | 'INVALID_SOURCE_CONTEXT';

const messages: Record<ResearchContextErrorCode, string> = {
  APPLICATION_UNAVAILABLE: 'An Application is required for Research.',
  JOB_DESCRIPTION_UNAVAILABLE:
    'A Job Description is required to research an Application.',
  INVALID_SOURCE_CONTEXT: 'The Research source context is inconsistent.',
};

export class ResearchContextError
  extends Error
  implements HttpMappableDomainError
{
  readonly httpMapping: HttpMappableDomainError['httpMapping'];

  constructor(readonly code: ResearchContextErrorCode) {
    super(messages[code]);
    this.name = new.target.name;
    this.httpMapping = {
      statusCode: code === 'APPLICATION_UNAVAILABLE' ? 404 : 409,
      code,
      safeMessage: messages[code],
    };
  }
}
