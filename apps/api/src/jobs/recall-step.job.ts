import { Logger } from '@nestjs/common';
import type { RecallStepStatus } from '../generated/prisma/client.js';
import { RecallStepsService } from '../modules/recalls/recall-steps.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from '../tenancy/tenant-context.js';
import { jobContext } from './app-context.js';

export type RecallStepJobStep = 'BLOCK_LOTS' | 'REPORT' | 'NOTIFY';

export interface RecallStepJobEvent {
  recallId: string;
  companyId: string;
  step: RecallStepJobStep;
}

export interface RecallStepJobResult {
  recallId: string;
  step: RecallStepJobStep;
  /** COMPLETED | SKIPPED: seguir; FAILED: a state machine deve parar (o recall já está FAILED). */
  status: RecallStepStatus;
}

const STEPS: ReadonlySet<string> = new Set(['BLOCK_LOTS', 'REPORT', 'NOTIFY']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lambda de uma etapa do recall, invocada por cada estado da state machine (Step Functions).
 * A etapa é idempotente: se já foi concluída, retorna o status gravado sem refazer nada.
 * Falhas da etapa não lançam exceção — ficam gravadas (recall FAILED + aviso) e voltam como
 * `status: "FAILED"`; só erros de entrada/infraestrutura lançam (e o Step Functions pode repetir).
 */
export async function handler(event: RecallStepJobEvent): Promise<RecallStepJobResult> {
  if (!UUID.test(event?.recallId ?? '') || !UUID.test(event?.companyId ?? '')) {
    throw new Error('Invalid event: recallId and companyId must be UUIDs');
  }
  if (!STEPS.has(event.step)) {
    throw new Error(`Invalid event: unknown step ${String(event.step)}`);
  }

  const app = await jobContext();
  const prisma = app.get(PrismaService);
  const tenant = app.get(TenantContext);
  const steps = app.get(RecallStepsService);

  // O par (recall, empresa) precisa existir: o evento não consegue apontar recall de outra empresa.
  const recall = await prisma.recall.findFirst({
    where: { id: event.recallId, companyId: event.companyId },
    select: { createdById: true },
  });
  if (!recall) throw new Error(`Recall ${event.recallId} not found for company ${event.companyId}`);

  // Executa em nome de quem abriu o recall (autoria das alterações e da auditoria).
  const status = await tenant.runAs(
    event.companyId,
    () => steps.runStep(event.recallId, event.step),
    recall.createdById,
    `sfn:${event.recallId}:${event.step}`,
  );
  new Logger('RecallStepJob').log({ ...event, status }, 'Recall step finished');
  return { recallId: event.recallId, step: event.step, status };
}
