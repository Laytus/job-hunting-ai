import { count, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { aiUsage } from '../db/schema.js';
import type {
  AiUsage,
  AiUsageGuardState,
  CreateAiUsageCommand,
} from './ai-usage.types.js';

type AiUsageRow = typeof aiUsage.$inferSelect;

function mapAiUsage(row: AiUsageRow): AiUsage {
  return {
    id: row.id,
    operationName: row.operationName,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    createdAt: row.createdAt,
  };
}

export class AiUsageRepository {
  constructor(private readonly database: Database) {}

  async recordUsage(command: CreateAiUsageCommand): Promise<AiUsage> {
    const [row] = await this.database.insert(aiUsage).values(command).returning();

    if (row === undefined) {
      throw new Error('AI usage insert did not return a row.');
    }

    return mapAiUsage(row);
  }

  async getUsageForGuard(operationName: string): Promise<AiUsageGuardState> {
    const [row] = await this.database
      .select({ recordedCalls: count() })
      .from(aiUsage)
      .where(eq(aiUsage.operationName, operationName));

    if (row === undefined) {
      throw new Error('AI usage guard query did not return a row.');
    }

    return row;
  }
}
