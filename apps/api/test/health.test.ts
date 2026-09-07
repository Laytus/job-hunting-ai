import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Database } from '../src/db/index.js';

const app = buildApp();

afterAll(async () => {
  await app.close();
});

describe('GET /api/health', () => {
  it('returns a stable success response', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('preserves injectable application dependencies', async () => {
    const database = {} as Database;
    const date = new Date(2026, 7, 19);
    const injectedApp = buildApp({ database, currentDate: () => date });

    expect(injectedApp.resolveDatabase()).toBe(database);
    expect(injectedApp.currentDate()).toBe(date);

    await injectedApp.close();
  });
});
