import { Logger } from '@nestjs/common';
import { AlertsService } from '../modules/alerts/alerts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from '../tenancy/tenant-context.js';
import { jobContext } from './app-context.js';

export interface ExpiryAlertResult {
  companies: number;
  notified: number;
  lots: number;
  failures: number;
}

/**
 * Lambda agendada (EventBridge Scheduler, sem entrada): para cada empresa, calcula os lotes com
 * saldo vencidos ou vencendo em `ALERT_EXPIRY_DAYS` dias e avisa pelo `Notifier` (SNS ou log).
 *
 * A lista de empresas vem do cliente sem filtro (é um job de plataforma); todo o resto roda
 * dentro de `TenantContext.runAs`, com o isolamento por empresa de sempre.
 */
export async function handler(): Promise<ExpiryAlertResult> {
  const app = await jobContext();
  const logger = new Logger('ExpiryAlertJob');
  const prisma = app.get(PrismaService);
  const tenant = app.get(TenantContext);
  const alerts = app.get(AlertsService);

  const companies = await prisma.company.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  const result: ExpiryAlertResult = {
    companies: companies.length,
    notified: 0,
    lots: 0,
    failures: 0,
  };

  for (const company of companies) {
    try {
      const outcome = await tenant.runAs(
        company.id,
        () => alerts.notifyExpiring(),
        undefined,
        `job:expiry-alert:${Date.now()}`,
      );
      if (outcome.lots > 0) result.notified++;
      result.lots += outcome.lots;
    } catch (error) {
      // Uma empresa com problema não impede o aviso das outras.
      result.failures++;
      logger.error({ err: error, companyId: company.id }, 'Expiry alert failed for company');
    }
  }

  logger.log(result, 'Expiry alert job finished');
  return result;
}
