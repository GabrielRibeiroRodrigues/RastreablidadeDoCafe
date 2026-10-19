import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/**
 * Sobe um Postgres descartável (mesma versão do compose/RDS) uma vez por execução,
 * aplica as migrations reais com o CLI do Prisma e entrega a URL aos testes via `inject`.
 */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('traceflow_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const databaseUrl = container.getConnectionUri();
  // Chama o CLI pelo próprio Node (sem shell): funciona igual no Windows e na CI.
  const prismaCli = resolve('node_modules/prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
  assertNoSchemaDrift(prismaCli, databaseUrl);

  project.provide('databaseUrl', databaseUrl);
}

/**
 * O banco migrado precisa bater com o `schema.prisma`: mudar o schema sem escrever a migration
 * (ou uma migration escrita à mão que diverge dele) falha aqui, antes de qualquer teste.
 */
function assertNoSchemaDrift(prismaCli: string, databaseUrl: string): void {
  try {
    execFileSync(
      process.execPath,
      [
        prismaCli,
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' },
    );
  } catch (error) {
    const output = (error as { stdout?: Buffer }).stdout?.toString() ?? String(error);
    throw new Error(
      `prisma/schema.prisma differs from the migrations; create one with \`pnpm --filter @traceflow/api db:migrate\`.\n${output}`,
      { cause: error },
    );
  }
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
