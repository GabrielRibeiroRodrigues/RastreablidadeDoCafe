import { Logger } from '@nestjs/common';
import { AuditRetentionService } from '../modules/audit/audit-retention.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from '../tenancy/tenant-context.js';
import { jobContext } from './app-context.js';

export interface AuditRetentionJobResult {
  companies: number;
  archived: number;
  files: number;
  failures: number;
  skippedNoStorage: boolean;
}

/**
 * Lambda agendada (mensal): arquiva no bucket e remove os registros de auditoria além da retenção
 * (`AUDIT_RETENTION_DAYS`), empresa a empresa, dentro de `TenantContext.runAs`.
 */
export async function handler(): Promise<AuditRetentionJobResult> {
  const app = await jobContext();
  const logger = new Logger('AuditRetentionJob');
  const prisma = app.get(PrismaService);
  const tenant = app.get(TenantContext);
  const retention = app.get(AuditRetentionService);

  const companies = await prisma.company.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  const result: AuditRetentionJobResult = {
    companies: companies.length,
    archived: 0,
    files: 0,
    failures: 0,
    skippedNoStorage: false,
  };

  for (const company of companies) {
    try {
      const outcome = await tenant.runAs(
        company.id,
        () => retention.archiveExpired(),
        undefined,
        `job:audit-retention:${Date.now()}`,
      );
      result.archived += outcome.archived;
      result.files += outcome.files.length;
      result.skippedNoStorage ||= outcome.skippedNoStorage;
    } catch (error) {
      // Uma empresa com problema não impede as outras; a falha volta no fim (alarme e DLQ).
      result.failures++;
      logger.error({ err: error, companyId: company.id }, 'Audit retention failed for company');
    }
  }

  if (result.skippedNoStorage) logger.warn('No files bucket configured: audit records were kept');
  logger.log(result, 'Audit retention job finished');
  if (result.failures) {
    throw new Error(
      `Audit retention failed for ${result.failures} of ${result.companies} companies`,
    );
  }
  return result;
}
