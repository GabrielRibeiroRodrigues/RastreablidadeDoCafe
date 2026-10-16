import { fileURLToPath } from 'node:url';
import type { Context } from 'aws-lambda';
import pg from 'pg';
import { loadRuntimeSecrets } from '../lambda/runtime-secrets.js';
import { readMigrations, runMigrations, type MigrationResult } from './migration-runner.js';

export interface MigrateEvent {
  /** Só lista o que seria aplicado. */
  dryRun?: boolean;
}

/**
 * Lambda que aplica as migrations pendentes no RDS. Invocada pelo workflow de deploy depois do
 * `terraform apply` e antes de publicar o front. As migrations são empacotadas ao lado do
 * `index.mjs` (pasta `migrations/`, copiada de `prisma/migrations` pelo bundle).
 */
export async function handler(
  event: MigrateEvent = {},
  context?: Context,
): Promise<MigrationResult> {
  if (context) context.callbackWaitsForEmptyEventLoop = false;
  await loadRuntimeSecrets();

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const dir =
    process.env['MIGRATIONS_DIR'] ?? fileURLToPath(new URL('./migrations', import.meta.url));
  const migrations = await readMigrations(dir);

  const client = new pg.Client({ connectionString, application_name: 'traceflow-migrate' });
  await client.connect();
  try {
    const result = await runMigrations(client, migrations, {
      dryRun: event.dryRun === true,
      log: (message) => console.log(message),
    });
    console.log(JSON.stringify({ msg: 'migrations finished', ...result }));
    return result;
  } finally {
    await client.end();
  }
}
