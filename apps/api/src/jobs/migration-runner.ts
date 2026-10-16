import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Client } from 'pg';

/**
 * Executor mínimo de migrations compatível com o `prisma migrate deploy`.
 *
 * Usa a mesma tabela `_prisma_migrations` (mesmas colunas e checksum SHA-256 do `migration.sql`)
 * e o mesmo advisory lock do Prisma, então o banco continua aceitando `prisma migrate deploy`
 * e `prisma migrate status` normalmente. Existe porque o CLI do Prisma (e o schema engine) não
 * cabem bem numa Lambda — veja docs/adr/0011-lambda-esbuild-migrations.md.
 *
 * Diferença deliberada: cada migration roda dentro de uma transação (no Postgres, DDL é
 * transacional), então uma falha não deixa o schema pela metade. Migrations que não podem rodar em
 * transação (ex.: `CREATE INDEX CONCURRENTLY`) devem ser aplicadas com o CLI do Prisma.
 */

/** Mesmo identificador de advisory lock usado pelo Prisma Migrate. */
const PRISMA_ADVISORY_LOCK = 72707369;

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum"            VARCHAR(64) NOT NULL,
  "finished_at"         TIMESTAMPTZ,
  "migration_name"      VARCHAR(255) NOT NULL,
  "logs"                TEXT,
  "rolled_back_at"      TIMESTAMPTZ,
  "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

export interface LocalMigration {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
  pending: string[];
}

interface AppliedRow {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export async function readMigrations(dir: string): Promise<LocalMigration[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(join(dir, name, 'migration.sql'), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    }),
  );
}

export async function runMigrations(
  client: Client,
  migrations: LocalMigration[],
  options: { dryRun?: boolean; log?: (message: string) => void } = {},
): Promise<MigrationResult> {
  const log = options.log ?? (() => undefined);
  const result: MigrationResult = { applied: [], alreadyApplied: [], pending: [] };

  await client.query('SELECT pg_advisory_lock($1)', [PRISMA_ADVISORY_LOCK]);
  try {
    await client.query(CREATE_TABLE);
    const { rows } = await client.query<AppliedRow>(
      `SELECT migration_name, checksum, finished_at, rolled_back_at
         FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
    );
    const applied = new Map(rows.map((row) => [row.migration_name, row]));

    const failed = rows.filter((row) => row.finished_at === null);
    if (failed.length > 0) {
      // Mesmo comportamento do Prisma (P3009): exige resolução manual antes de seguir.
      throw new Error(
        `Failed migrations found: ${failed.map((r) => r.migration_name).join(', ')}. ` +
          'Fix the database and mark them with `prisma migrate resolve` before retrying.',
      );
    }

    for (const migration of migrations) {
      const row = applied.get(migration.name);
      if (row) {
        if (row.checksum !== migration.checksum) {
          log(`warning: ${migration.name} was modified after being applied (checksum mismatch)`);
        }
        result.alreadyApplied.push(migration.name);
        continue;
      }

      if (options.dryRun) {
        result.pending.push(migration.name);
        continue;
      }

      log(`applying ${migration.name}`);
      await client.query('BEGIN');
      try {
        const id = randomUUID();
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at)
           VALUES ($1, $2, $3, now())`,
          [id, migration.checksum, migration.name],
        );
        await client.query(migration.sql);
        await client.query(
          `UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1
            WHERE id = $1`,
          [id],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${migration.name} failed and was rolled back`, {
          cause: error,
        });
      }
      result.applied.push(migration.name);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [PRISMA_ADVISORY_LOCK]);
  }

  return result;
}
