import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { RecallStatus, RecallStepStatus } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RECALL_RUNNER, type RecallRunner } from './recall-runner.js';
import { RecallStepsService } from './recall-steps.service.js';

/**
 * Workflow do recall: OPEN → EXECUTING → COMPLETED | FAILED (→ retry → EXECUTING) → CLOSED.
 * A orquestração fica atrás de `RecallRunner` (local ou Step Functions); o estado de cada etapa
 * fica no banco, então iniciar de novo um recall que falhou retoma da etapa que falhou.
 */
@Injectable()
export class RecallWorkflow {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly steps: RecallStepsService,
    private readonly audit: AuditService,
    @Inject(RECALL_RUNNER) private readonly runner: RecallRunner,
  ) {}

  get orchestration(): RecallRunner['kind'] {
    return this.runner.kind;
  }

  /** Inicia (OPEN) ou retoma (FAILED) a execução. */
  async start(recallId: string, retry = false): Promise<void> {
    const startable = [RecallStatus.OPEN, RecallStatus.FAILED];
    // Transição condicional: duas chamadas simultâneas não iniciam duas execuções.
    const { count } = await this.db.client.recall.updateMany({
      where: { id: recallId, status: { in: startable } },
      data: { status: RecallStatus.EXECUTING, lastError: null },
    });
    const recall = await this.db.client.recall.findUniqueOrThrow({
      where: { id: recallId },
      select: { id: true, companyId: true, number: true, status: true, startedAt: true },
    });
    if (count === 0) {
      throw new DomainProblemException(
        '/problems/recall-not-startable',
        `Recall ${recall.number} is ${recall.status}; only OPEN or FAILED recalls can run.`,
        HttpStatus.CONFLICT,
        { recallStatus: recall.status },
      );
    }
    if (!recall.startedAt) {
      await this.db.client.recall.update({
        where: { id: recallId },
        data: { startedAt: new Date() },
      });
    }
    // Etapas que falharam voltam a pendentes; as concluídas não serão refeitas.
    await this.db.client.recallStep.updateMany({
      where: { recallId, status: { in: [RecallStepStatus.FAILED, RecallStepStatus.RUNNING] } },
      data: { status: RecallStepStatus.PENDING, error: null },
    });
    await this.audit.record({
      action: retry ? 'recall.retried' : 'recall.started',
      entityType: 'recall',
      entityId: recallId,
      after: { number: recall.number, orchestration: this.runner.kind },
    });

    try {
      const { executionArn } = await this.runner.start(recall);
      if (executionArn) {
        await this.db.client.recall.update({ where: { id: recallId }, data: { executionArn } });
      }
    } catch (error) {
      // Ex.: Step Functions indisponível ou sem permissão — o recall fica FAILED e pode ser retomado.
      await this.steps.fail(recallId, null, 'START', error);
    }
  }
}
