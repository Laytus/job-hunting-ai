export type AiUsageErrorCode =
  | 'USAGE_METADATA_UNAVAILABLE'
  | 'USAGE_RECORDING_FAILED'
  | 'USAGE_CHECK_FAILED'
  | 'USAGE_NOT_ALLOWED';

const messages: Record<AiUsageErrorCode, string> = {
  USAGE_METADATA_UNAVAILABLE: 'Reliable LLM usage metadata is unavailable.',
  USAGE_RECORDING_FAILED: 'LLM usage could not be recorded.',
  USAGE_CHECK_FAILED: 'LLM usage permission could not be verified.',
  USAGE_NOT_ALLOWED: 'LLM usage is not allowed for this operation.',
};

export class AiUsageError extends Error {
  constructor(readonly code: AiUsageErrorCode) {
    super(messages[code]);
    this.name = new.target.name;
  }
}
