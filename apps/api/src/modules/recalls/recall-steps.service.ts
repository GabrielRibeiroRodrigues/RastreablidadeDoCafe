import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  LotStatus,
  RecallStatus,
  RecallStepName,
  RecallStepStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import { NOTIFIER, type Notifier } from '../../notifications/notifier.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { AuditService, type AuditEntry } from '../audit/audit.service.js';
import { formatQuantity } from '../inventory/quantity.js';
import { StockLedgerService } from '../inventory/stock-ledger.service.js';
import { TraceService } from '../trace/trace.service.js';
import { buildRecallReportPdf } from './recall-report.js';

/** Ordem das etapas do workflow (também a ordem da state machine na AWS). */
export const RECALL_STEPS: readonly RecallStepName[] = [
  RecallStepName.BLOCK_LOTS,
  RecallStepName.REPORT,
  RecallStepName.NOTIFY,
];

const DONE: ReadonlySet<RecallStepStatus> = new Set([
  RecallStepStatus.COMPLETED,
  RecallStepStatus.SKIPPED,
]);

interface StepOutcome {
  status: RecallStepStatus;
  output: Prisma.InputJsonValue;
}

const SEVERITY_PT = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta' } as const;
const STATUS_PT: Record<LotStatus, string> = {
  AVAILABLE: 'Disponível',
  QUARANTINE: 'Quarentena',
  BLOCKED: 'Bloqueado',
  CONSUMED: 'Consumido',
};
const RECALL_STATUS_PT: Record<RecallStatus, string> = {
  OPEN: 'Aberto',
  EXECUTING: 'Em execução',
  COMPLETED: 'Executado',
  FAILED: 'Falhou',
  CLOSED: 'Encerrado',
};
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

const PDF = 'application/pdf';

/**
 * Executa **uma** etapa do recall, com o estado persistido em `recall_steps`:
 *
 * - etapa já concluída (ou pulada) não roda de novo → idempotente, retomável;
 * - sucesso: grava status/tempo/saída e, se foi a última, conclui o recall;
 * - falha: grava o erro na etapa, marca o recall como FAILED e avisa (o retry retoma daqui).
 *
 * É chamada pelo runner local (no processo da API) ou pela Lambda de cada estado do Step Functions
 * (`src/jobs/recall-step.job.ts`).
 */
@Injectable()
export class RecallStepsService {
  private readonly logger = new Logger(RecallStepsService.name);

  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly ledger: StockLedgerService,
    private readonly trace: TraceService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  async runStep(recallId: string, name: RecallStepName): Promise<RecallStepStatus> {
    const step = await this.db.client.recallStep.findFirst({ where: { recallId, name } });
    if (!step) throw new NotFoundException('Recall step not found');
    if (DONE.has(step.status)) return step.status;

    const recall = await this.db.client.recall.findUniqueOrThrow({ where: { id: recallId } });
    if (recall.status === RecallStatus.CLOSED) return step.status;

    await this.db.client.recallStep.update({
      where: { id: step.id },
      data: {
        status: RecallStepStatus.RUNNING,
        attempts: { increment: 1 },
        startedAt: new Date(),
        finishedAt: null,
        error: null,
      },
    });

    try {
      const outcome = await this.execute(name, recallId);
      await this.db.client.recallStep.update({
        where: { id: step.id },
        data: { status: outcome.status, finishedAt: new Date(), output: outcome.output },
      });
      this.logger.log({ recall: recall.number, step: name, status: outcome.status }, 'Recall step');
      await this.completeIfDone(recallId);
      return outcome.status;
    } catch (error) {
      await this.fail(recallId, step.id, name, error);
      return RecallStepStatus.FAILED;
    }
  }

  /** Marca a falha (etapa e recall), audita e avisa. Também usado se o runner não conseguir iniciar. */
  async fail(
    recallId: string,
    stepId: string | null,
    name: RecallStepName | 'START',
    error: unknown,
  ): Promise<void> {
    const message = describeError(error).slice(0, 1000);
    this.logger.error({ err: error, recallId, step: name }, 'Recall step failed');

    if (stepId) {
      await this.db.client.recallStep.update({
        where: { id: stepId },
        data: { status: RecallStepStatus.FAILED, finishedAt: new Date(), error: message },
      });
    }
    const recall = await this.db.client.recall.update({
      where: { id: recallId },
      data: { status: RecallStatus.FAILED, lastError: `${name}: ${message}` },
      select: { id: true, number: true },
    });
    await this.audit.record({
      action: 'recall.failed',
      entityType: 'recall',
      entityId: recallId,
      after: { number: recall.number, step: name, error: message },
    });
    await this.safeNotify({
      event: 'recall.failed',
      companyId: this.tenant.requireCompanyId(),
      subject: `TraceFlow: recall ${recall.number} FALHOU na etapa ${name}`,
      body:
        `A etapa ${name} do recall ${recall.number} falhou:\n\n${message}\n\n` +
        'Corrija a causa e use "Tentar novamente" (POST /v1/recalls/{id}/retry): ' +
        'as etapas já concluídas não são refeitas.',
      data: { recallId, number: recall.number, step: name, error: message },
    });
  }

  private execute(name: RecallStepName, recallId: string): Promise<StepOutcome> {
    switch (name) {
      case RecallStepName.BLOCK_LOTS:
        return this.blockLots(recallId);
      case RecallStepName.REPORT:
        return this.report(recallId);
      case RecallStepName.NOTIFY:
        return this.notify(recallId);
    }
  }

  /**
   * Bloqueia todos os lotes afetados numa transação, travando-os em ordem de id (sem deadlock com
   * produção/expedição, que usam a mesma ordem). Só processa os ainda não bloqueados por este
   * recall (`blocked_at` nulo) e grava o status anterior de cada um.
   */
  private async blockLots(recallId: string): Promise<StepOutcome> {
    return this.db.transaction(
      async (tx) => {
        const pending = await tx.recallLot.findMany({
          where: { recallId, blockedAt: null },
          orderBy: { lotId: 'asc' },
          select: { id: true, lotId: true },
        });
        const recall = await tx.recall.findUniqueOrThrow({
          where: { id: recallId },
          select: { number: true },
        });

        const audits: AuditEntry[] = [];
        let changed = 0;
        for (const item of pending) {
          const lot = await this.ledger.lockLot(tx, item.lotId);
          if (lot.status !== LotStatus.BLOCKED) {
            await tx.lot.update({ where: { id: lot.id }, data: { status: LotStatus.BLOCKED } });
            changed++;
            audits.push({
              action: 'lot.status_changed',
              entityType: 'lot',
              entityId: lot.id,
              before: { code: lot.code, status: lot.status },
              after: { code: lot.code, status: LotStatus.BLOCKED, recall: recall.number },
            });
          }
          await tx.recallLot.update({
            where: { id: item.id },
            data: { previousStatus: lot.status, blockedAt: new Date() },
          });
        }
        await this.audit.recordMany(audits, tx);

        const total = await tx.recallLot.count({ where: { recallId } });
        return {
          status: RecallStepStatus.COMPLETED,
          output: { lots: total, blockedNow: changed, alreadyBlocked: pending.length - changed },
        };
      },
      { timeout: 60_000 },
    );
  }

  /** PDF do recall no bucket; sem armazenamento configurado, a etapa é pulada (não falha). */
  private async report(recallId: string): Promise<StepOutcome> {
    if (!this.storage.isConfigured) {
      return { status: RecallStepStatus.SKIPPED, output: { reason: 'storage not configured' } };
    }
    const companyId = this.tenant.requireCompanyId();
    const recall = await this.db.client.recall.findUniqueOrThrow({
      where: { id: recallId },
      include: {
        createdBy: { select: { name: true } },
        originLot: { select: { id: true, code: true, product: { select: { name: true } } } },
        lots: {
          include: {
            lot: {
              select: { code: true, status: true, unit: true, product: { select: { name: true } } },
            },
          },
          orderBy: [{ depth: 'asc' }, { lot: { code: 'asc' } }],
        },
        customers: {
          include: {
            customer: { select: { name: true, city: true, state: true, email: true, phone: true } },
          },
          orderBy: { customer: { name: 'asc' } },
        },
      },
    });
    const [company, backward] = await Promise.all([
      this.db.client.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { name: true },
      }),
      this.trace.backward(recall.originLotId),
    ]);

    const pdf = await buildRecallReportPdf({
      companyName: company.name,
      number: recall.number,
      severity: SEVERITY_PT[recall.severity],
      status: RECALL_STATUS_PT[recall.status],
      reason: recall.reason,
      createdAt: dateTime.format(recall.createdAt),
      createdBy: recall.createdBy.name,
      generatedAt: dateTime.format(new Date()),
      originLot: { code: recall.originLot.code, product: recall.originLot.product.name },
      origins: backward.origins.map((origin) =>
        [origin.farmName ?? origin.name, [origin.city, origin.state].filter(Boolean).join('/')]
          .filter(Boolean)
          .join(' - '),
      ),
      lots: recall.lots.map((item) => ({
        code: item.lot.code,
        product: item.lot.product.name,
        depth: item.depth,
        balance: `${formatQuantity(item.balance)} ${item.lot.unit}`,
        previousStatus: item.previousStatus ? STATUS_PT[item.previousStatus] : '-',
        status: STATUS_PT[item.lot.status],
      })),
      customers: recall.customers.map((item) => ({
        name: item.customer.name,
        place: [item.customer.city, item.customer.state].filter(Boolean).join('/') || '-',
        contact: [item.customer.email, item.customer.phone].filter(Boolean).join(' ') || '-',
        shipments: item.shipmentNumbers.join(', '),
        quantities: quantitiesText(item.quantities),
      })),
    });

    const key = `${companyId}/recalls/${recall.id}.pdf`;
    await this.storage.putObject(key, pdf, PDF);
    await this.db.client.recall.update({ where: { id: recall.id }, data: { reportKey: key } });
    return { status: RecallStepStatus.COMPLETED, output: { reportKey: key, bytes: pdf.length } };
  }

  private async notify(recallId: string): Promise<StepOutcome> {
    const recall = await this.db.client.recall.findUniqueOrThrow({
      where: { id: recallId },
      include: {
        originLot: { select: { code: true } },
        lots: { include: { lot: { select: { code: true } } }, orderBy: { depth: 'asc' } },
        customers: {
          include: { customer: { select: { name: true, email: true, phone: true } } },
          orderBy: { customer: { name: 'asc' } },
        },
      },
    });

    const customerLines = recall.customers.map(
      (item) =>
        `- ${item.customer.name} (${[item.customer.email, item.customer.phone].filter(Boolean).join(', ') || 'sem contato'}): ` +
        `${item.shipmentNumbers.join(', ')} - ${quantitiesText(item.quantities)}`,
    );
    await this.notifier.notify({
      event: 'recall.executed',
      companyId: this.tenant.requireCompanyId(),
      subject: `TraceFlow: recall ${recall.number} (${SEVERITY_PT[recall.severity]}) - ${recall.lots.length} lote(s) bloqueado(s)`,
      body: [
        `Recall ${recall.number} - gravidade ${SEVERITY_PT[recall.severity]}`,
        `Lote de origem: ${recall.originLot.code}`,
        `Motivo: ${recall.reason}`,
        '',
        `Lotes bloqueados (${recall.lots.length}): ${recall.lots.map((item) => item.lot.code).join(', ')}`,
        '',
        recall.customers.length
          ? `Clientes a contatar (${recall.customers.length}):\n${customerLines.join('\n')}`
          : 'Nenhum cliente recebeu os lotes afetados.',
        recall.reportKey ? '\nRelatório PDF disponível no TraceFlow.' : '',
      ].join('\n'),
      data: {
        recallId: recall.id,
        number: recall.number,
        severity: recall.severity,
        lots: recall.lots.map((item) => item.lot.code),
        customers: recall.customers.map((item) => item.customer.name),
      },
    });
    return {
      status: RecallStepStatus.COMPLETED,
      output: { customers: recall.customers.length, lots: recall.lots.length },
    };
  }

  /** Todas as etapas concluídas/puladas → recall COMPLETED (uma vez só, mesmo com corrida). */
  private async completeIfDone(recallId: string): Promise<void> {
    const steps = await this.db.client.recallStep.findMany({
      where: { recallId },
      select: { status: true },
    });
    if (!steps.every((step) => DONE.has(step.status))) return;

    const { count } = await this.db.client.recall.updateMany({
      where: { id: recallId, status: RecallStatus.EXECUTING },
      data: { status: RecallStatus.COMPLETED, completedAt: new Date(), lastError: null },
    });
    if (count > 0) {
      await this.audit.record({
        action: 'recall.executed',
        entityType: 'recall',
        entityId: recallId,
        after: { status: RecallStatus.COMPLETED, steps: steps.map((step) => step.status) },
      });
    }
  }

  private async safeNotify(notification: Parameters<Notifier['notify']>[0]): Promise<void> {
    try {
      await this.notifier.notify(notification);
    } catch (error) {
      this.logger.error({ err: error, event: notification.event }, 'Notification failed');
    }
  }
}

/** `[{ unit: "KG", quantity: "12.000" }]` → `12.000 KG`. */
function quantitiesText(value: Prisma.JsonValue): string {
  if (!Array.isArray(value)) return '-';
  return (
    value
      .map((item) => {
        const { unit, quantity } = (item ?? {}) as { unit?: string; quantity?: string };
        return unit && quantity ? `${quantity} ${unit}` : '';
      })
      .filter(Boolean)
      .join(' + ') || '-'
  );
}

/**
 * Texto do erro para a etapa e o aviso. Falhas de rede (ex.: conexão recusada pelo S3) chegam como
 * `AggregateError` com `message` vazia: usa as mensagens internas ou o código do erro.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.message) return error.message;
  if (error instanceof AggregateError && error.errors.length) {
    return [...new Set(error.errors.map(describeError))].join('; ');
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? `${error.name} (${code})` : error.name;
}
