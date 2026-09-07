import { buildApp } from './app.js';

const host = process.env['API_HOST'] ?? 'localhost';
const port = Number.parseInt(process.env['API_PORT'] ?? '3000', 10);
const app = buildApp({ logger: true });

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error({ err: error }, 'Failed to start API server');

  try {
    await app.close();
  } catch (closeError) {
    app.log.error({ err: closeError }, 'Failed to close API server');
  }

  process.exitCode = 1;
}
