const MAINTENANCE_DATABASES = new Set(['postgres', 'template0', 'template1']);

export interface TestDatabaseTarget {
  databaseName: string;
  maintenanceUrl: string;
  url: string;
}

function parseDatabaseUrl(value: string, variableName: string): URL {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      throw new Error('URL must use the postgres or postgresql protocol.');
    }

    return parsed;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Invalid URL.';
    throw new Error(`${variableName} must be a valid PostgreSQL URL. ${reason}`);
  }
}

function databaseNameFromUrl(url: URL, variableName: string): string {
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  if (!databaseName || databaseName.includes('/')) {
    throw new Error(`${variableName} must name exactly one database.`);
  }

  return databaseName;
}

function databaseIdentity(url: URL, variableName: string): string {
  const port = url.port || '5432';
  return `${url.hostname.toLowerCase()}:${port}/${databaseNameFromUrl(url, variableName)}`;
}

export function getTestDatabaseTarget(environment: NodeJS.ProcessEnv = process.env): TestDatabaseTarget {
  const value = environment['DATABASE_TEST_URL'];

  if (!value) {
    throw new Error(
      'DATABASE_TEST_URL is required for database integration tooling; DATABASE_URL is never used as a fallback.',
    );
  }

  const testUrl = parseDatabaseUrl(value, 'DATABASE_TEST_URL');
  const databaseName = databaseNameFromUrl(testUrl, 'DATABASE_TEST_URL');

  if (MAINTENANCE_DATABASES.has(databaseName)) {
    throw new Error(`DATABASE_TEST_URL must not target the ${databaseName} maintenance database.`);
  }

  const developmentValue = environment['DATABASE_URL'];
  if (developmentValue) {
    const developmentUrl = parseDatabaseUrl(developmentValue, 'DATABASE_URL');

    if (
      databaseIdentity(testUrl, 'DATABASE_TEST_URL') ===
      databaseIdentity(developmentUrl, 'DATABASE_URL')
    ) {
      throw new Error('DATABASE_TEST_URL must not target the same database as DATABASE_URL.');
    }
  }

  const maintenanceUrl = new URL(testUrl);
  maintenanceUrl.pathname = '/postgres';

  return {
    databaseName,
    maintenanceUrl: maintenanceUrl.toString(),
    url: testUrl.toString(),
  };
}
