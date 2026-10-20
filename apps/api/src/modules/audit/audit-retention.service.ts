import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { gzipSync } from 'node:zlib';
import type { Env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';

/** Registros por arquivo/transação: cabe folgado no tempo e na memória da Lambda. */
export const AUDIT_ARCHIVE_BATCH = 5000;

export interface AuditRetentionResult {
  archived: number;
  files: string[];
  /** true quando nada foi feito porque não há bucket configurado (nada é apagado sem arquivo). */
  skippedNoStorage: boolean;
}

interface AuditRow {
  id: string;
  created_at: Date;
  [column: string]: unknown;
}

/**
 * Retenção da trilha de auditoria da empresa do contexto: registros mais antigos que
 * `AUDIT_RETENTION_DAYS` são **arquivados** no bucket (`<empresa>/audit-archive/*.jsonl.gz`) e só
 * então removidos — na mesma transação, com a flag que o trigger exige. Sem bucket, nada é apagado.
 */
@Injectable()
export class AuditRetentionService {
  private readonly logger = new Logger(AuditRetentionService.name);

  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async archiveExpired(maxBatches = 20): Promise<AuditRetentionResult> {
    const result: AuditRetentionResult = { archived: 0, files: [], skippedNoStorage: false };
    if (!this.storage.isConfigured) {
      result.skippedNoStorage = true;
      return result;
    }
    const days = this.config.get('AUDIT_RETENTION_DAYS', { infer: true });
    const companyId = this.tenant.requireCompanyId();

    for (let batch = 0; batch < maxBatches; batch++) {
      const archived = await this.db.transaction(
        async (tx) => {
          // Só vale nesta transação (`is_local = true`): libera o DELETE no trigger.
          await tx.sql(
            () => Prisma.sql`SELECT set_config('traceflow.audit_retention', 'on', true)`,
          );
          const rows = await tx.sql<AuditRow[]>(
            (scope) => Prisma.sql`
              SELECT id, user_id, action, entity_type, entity_id, before, after, request_id, ip,
                     created_at
              FROM audit_logs
              WHERE company_id = ${scope}::uuid
                AND created_at < now() - ${days} * interval '1 day'
              ORDER BY created_at, id
              LIMIT ${AUDIT_ARCHIVE_BATCH}
              FOR UPDATE`,
          );
          const first = rows[0];
          const last = rows.at(-1);
          if (!first || !last) return null;

          const day = first.created_at.toISOString().slice(0, 10);
          const key = `${companyId}/audit-archive/${day}_${last.id}.jsonl.gz`;
          const lines = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
          await this.storage.putObject(key, gzipSync(lines), 'application/gzip');

          const ids = rows.map((row) => row.id);
          await tx.sql(
            (scope) => Prisma.sql`
              DELETE FROM audit_logs
              WHERE company_id = ${scope}::uuid AND id = ANY(${ids}::uuid[])`,
          );
          return { key, count: rows.length };
        },
        { timeout: 60_000 },
      );
      if (!archived) break;
      result.archived += archived.count;
      result.files.push(archived.key);
      if (archived.count < AUDIT_ARCHIVE_BATCH) break;
    }

    if (result.archived) this.logger.log({ companyId, ...result }, 'Audit records archived');
    return result;
  }
}
