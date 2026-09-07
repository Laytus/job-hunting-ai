export interface AiUsage {
  readonly id: string;
  readonly operationName: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly createdAt: Date;
}

export interface CreateAiUsageCommand {
  readonly operationName: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface AiUsageGuardState {
  readonly recordedCalls: number;
}
