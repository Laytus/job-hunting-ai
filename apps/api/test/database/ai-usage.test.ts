import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import * as schema from '../../src/db/schema.js';
import { AiUsageRepository } from '../../src/llm/ai-usage.repository.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

let client: Sql;
let database: TestDatabase;
let repository: AiUsageRepository;

async function resetAiUsage(): Promise<void> {
  await client.unsafe('truncate table ai_usage');
}

beforeAll(async () => {
  const target = getTestDatabaseTarget();
  client = postgres(target.url, { max: 5, onnotice: () => undefined });
  database = drizzle(client, { schema });
  repository = new AiUsageRepository(database);
  await resetAiUsage();
});

afterEach(resetAiUsage);

afterAll(async () => {
  await client.end();
});

describe('AiUsage persistence', () => {
  it('is created by the committed migration', async () => {
    const [table] = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'ai_usage'
    `;

    expect(table).toEqual({ table_name: 'ai_usage' });
  });

  it('persists provider-reported operation, model, token, ID, and timestamp values', async () => {
    const record = await repository.recordUsage({
      operationName: 'TEST_STRUCTURED_OUTPUT',
      model: 'provider-model',
      inputTokens: 17,
      outputTokens: 9,
      totalTokens: 26,
    });

    expect(record).toMatchObject({
      operationName: 'TEST_STRUCTURED_OUTPUT',
      model: 'provider-model',
      inputTokens: 17,
      outputTokens: 9,
      totalTokens: 26,
    });
    expect(record.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(record.createdAt).toBeInstanceOf(Date);
  });

  it('returns deterministic per-operation call counts for guard decisions', async () => {
    await repository.recordUsage({
      operationName: 'TEST_OPERATION',
      model: 'model-a',
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
    });
    await repository.recordUsage({
      operationName: 'OTHER_OPERATION',
      model: 'model-b',
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
    });
    await repository.recordUsage({
      operationName: 'TEST_OPERATION',
      model: 'model-a',
      inputTokens: 4,
      outputTokens: 2,
      totalTokens: 6,
    });

    await expect(repository.getUsageForGuard('TEST_OPERATION')).resolves.toEqual({
      recordedCalls: 2,
    });
    await expect(repository.getUsageForGuard('MISSING_OPERATION')).resolves.toEqual({
      recordedCalls: 0,
    });
  });

  it.each(['inputTokens', 'outputTokens', 'totalTokens'] as const)(
    'rejects a negative %s value',
    async (field) => {
      await expect(
        database.insert(schema.aiUsage).values({
          operationName: 'TEST_OPERATION',
          model: 'provider-model',
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          [field]: -1,
        }),
      ).rejects.toMatchObject({ cause: { code: '23514' } });
    },
  );

  it.each([
    { operationName: ' ', model: 'provider-model' },
    { operationName: 'TEST_OPERATION', model: '   ' },
  ])('rejects blank operation or model values', async ({ operationName, model }) => {
    await expect(
      database.insert(schema.aiUsage).values({
        operationName,
        model,
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });
});
