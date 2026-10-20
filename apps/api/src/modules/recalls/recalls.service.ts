import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { pageArgs, toPage, type Page } from '../../common/http/pagination.js';
import {
  LotStatus,
  RecallStatus,
  RecallStepStatus,
  type Prisma,
  type Unit,
} from '../../generated/prisma/client.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import {
  TenantPrismaService,
  type TenantTransaction,
} from '../../tenancy/tenant-prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DOCUMENT_KINDS, DocumentNumberService } from '../inventory/document-number.service.js';
import { formatQuantity } from '../inventory/quantity.js';
import { StockLedgerService } from '../inventory/stock-ledger.service.js';
import { RecallImpactService } from './recall-impact.service.js';
import { RECALL_STEPS } from './recall-steps.service.js';
import { RecallWorkflow } from './recall-workflow.service.js';
import type {
  CloseRecallDto,
  CreateRecallDto,
  ListRecallsQueryDto,
  RecallDetailResponse,
  RecallReportResponse,
  RecallResponse,
  RecallSimulationResponse,
  UnitQuantity,
} from './recalls.dto.js';

const USER_SELECT = { select: { id: true, name: true } } as const;
const PRODUCT_SELECT = { select: { id: true, sku: true, name: true, type: true } } as const;

const LIST_INCLUDE = {
  originLot: { select: { id: true, code: true } },
  createdBy: USER_SELECT,
  _count: { select: { lots: true, customers: true } },
} as const satisfies Prisma.RecallInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  closedBy: USER_SELECT,
  steps: { orderBy: { position: 'asc' } },
  lots: {
    include: {
      lot: { select: { id: true, code: true, status: true, unit: true, product: PRODUCT_SELECT } },
    },
    orderBy: [{ depth: 'asc' }, { lot: { code: 'asc' } }],
  },
  customers: {
    include: {
      customer: {
        select: { id: true, name: true, city: true, state: true, email: true, phone: true },
      },
    },
    orderBy: { customer: { name: 'asc' } },
  },
} as const satisfies Prisma.RecallInclude;

type RecallListRow = Prisma.RecallGetPayload<{ include: typeof LIST_INCLUDE }>;
type RecallDetailRow = Prisma.RecallGetPayload<{ include: typeof DETAIL_INCLUDE }>;

@Injectable()
export class RecallsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly impact: RecallImpactService,
    private readonly workflow: RecallWorkflow,
    private readonly ledger: StockLedgerService,
    private readonly numbers: DocumentNumberService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /** Só leitura: o que seria bloqueado e quem seria avisado. */
  simulate(lotId: string): Promise<RecallSimulationResponse> {
    return this.impact.simulate(lotId);
  }

  /**
   * Cria o recall com a fotografia do impacto (lotes e clientes) e dispara o workflow.
   * Com o runner local, a resposta já traz o resultado das etapas; com Step Functions, EXECUTING.
   */
  async create(dto: CreateRecallDto): Promise<RecallDetailResponse> {
    const impact = await this.impact.simulate(dto.lotId);

    const id = await this.db.transaction(
      async (tx) => {
        const origin = await this.ledger.lockLot(tx, dto.lotId);
        const open = await tx.recall.findFirst({
          where: { originLotId: origin.id, status: { not: RecallStatus.CLOSED } },
          select: { id: true, number: true },
        });
        if (open) {
          throw new DomainProblemException(
            '/problems/recall-already-open',
            `Lot ${origin.code} already has an open recall (${open.number}).`,
            HttpStatus.CONFLICT,
            { recall: open.number, recallId: open.id },
          );
        }

        const number = await this.numbers.next(tx, DOCUMENT_KINDS.recall);
        const recall = await tx.recall.create({
          data: {
            number,
            originLotId: origin.id,
            reason: dto.reason,
            severity: dto.severity,
            createdById: this.tenant.requireUserId(),
          } as Prisma.RecallUncheckedCreateInput,
        });
        await tx.recallStep.createMany({
          data: RECALL_STEPS.map((name, index) => ({
            recallId: recall.id,
            name,
            position: index + 1,
            status: RecallStepStatus.PENDING,
          })) as Prisma.RecallStepCreateManyInput[],
        });
        await tx.recallLot.createMany({
          data: impact.lots.map((lot) => ({
            recallId: recall.id,
            lotId: lot.id,
            depth: lot.depth,
            balance: lot.balance,
          })) as Prisma.RecallLotCreateManyInput[],
        });
        if (impact.customers.length) {
          await tx.recallCustomer.createMany({
            data: impact.customers.map((item) => ({
              recallId: recall.id,
              customerId: item.customer.id,
              shipmentsCount: item.shipmentsCount,
              shipmentNumbers: item.shipmentNumbers,
              quantities: item.quantities as unknown as Prisma.InputJsonValue,
            })) as Prisma.RecallCustomerCreateManyInput[],
          });
        }

        await this.audit.record(
          {
            action: 'recall.created',
            entityType: 'recall',
            entityId: recall.id,
            after: {
              number,
              originLot: origin.code,
              reason: dto.reason,
              severity: dto.severity,
              lots: impact.lots.map((lot) => lot.code),
              customers: impact.customers.map((item) => item.customer.name),
              totals: impact.totals,
            },
          },
          tx,
        );
        return recall.id;
      },
      { timeout: 30_000 },
    );

    await this.workflow.start(id);
    return this.get(id);
  }

  async retry(id: string): Promise<RecallDetailResponse> {
    await this.workflow.start(id, true);
    return this.get(id);
  }

  /** Encerra com notas. Os lotes continuam BLOCKED: liberar exige troca explícita de status. */
  async close(id: string, dto: CloseRecallDto): Promise<RecallDetailResponse> {
    await this.db.transaction(async (tx) => {
      const recall = await tx.recall.findUniqueOrThrow({
        where: { id },
        select: { number: true, status: true },
      });
      const { count } = await tx.recall.updateMany({
        where: { id, status: { in: [RecallStatus.COMPLETED, RecallStatus.FAILED] } },
        data: {
          status: RecallStatus.CLOSED,
          closedAt: new Date(),
          closedById: this.tenant.requireUserId(),
          closingNotes: dto.notes,
        },
      });
      if (count === 0) {
        throw new DomainProblemException(
          '/problems/recall-not-closable',
          `Recall ${recall.number} is ${recall.status}; only COMPLETED or FAILED recalls can be closed.`,
          HttpStatus.CONFLICT,
          { recallStatus: recall.status },
        );
      }
      const released = dto.releaseLots ? await this.releaseLots(tx, id, recall.number) : [];
      await this.audit.record(
        {
          action: 'recall.closed',
          entityType: 'recall',
          entityId: id,
          before: { status: recall.status },
          after: { status: RecallStatus.CLOSED, notes: dto.notes, releasedLots: released },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * Devolve cada lote bloqueado por este recall ao status anterior ao bloqueio (sem saldo:
   * consumido). Lote que também está em outro recall aberto continua bloqueado. Travas em ordem
   * fixa de lote, como no razão.
   */
  private async releaseLots(
    tx: TenantTransaction,
    recallId: string,
    recallNumber: string,
  ): Promise<string[]> {
    const items = await tx.recallLot.findMany({
      where: { recallId, blockedAt: { not: null } },
      select: { lotId: true, previousStatus: true },
      orderBy: { lotId: 'asc' },
    });
    const released: string[] = [];
    for (const item of items) {
      const lot = await this.ledger.lockLot(tx, item.lotId);
      if (lot.status !== LotStatus.BLOCKED) continue;
      const otherOpen = await tx.recallLot.count({
        where: {
          lotId: lot.id,
          recallId: { not: recallId },
          recall: { status: { not: RecallStatus.CLOSED } },
        },
      });
      if (otherOpen > 0) continue;

      const balances = await this.ledger.balances(tx, lot.id);
      const status =
        balances.size === 0
          ? LotStatus.CONSUMED
          : item.previousStatus === LotStatus.QUARANTINE
            ? LotStatus.QUARANTINE
            : LotStatus.AVAILABLE;
      await tx.lot.update({ where: { id: lot.id }, data: { status } });
      await this.audit.record(
        {
          action: 'lot.status_changed',
          entityType: 'lot',
          entityId: lot.id,
          before: { code: lot.code, status: lot.status },
          after: { code: lot.code, status, reason: `Encerramento do ${recallNumber}` },
        },
        tx,
      );
      released.push(lot.code);
    }
    return released;
  }

  async list(query: ListRecallsQueryDto): Promise<Page<RecallResponse>> {
    const where: Prisma.RecallWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.lotId && { originLotId: query.lotId }),
    };
    const [rows, total] = await Promise.all([
      this.db.client.recall.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.db.client.recall.count({ where }),
    ]);
    return toPage(rows.map(toResponse), total, query);
  }

  async get(id: string): Promise<RecallDetailResponse> {
    const row = await this.db.client.recall.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    return toDetail(row);
  }

  async reportUrl(id: string): Promise<RecallReportResponse> {
    const recall = await this.db.client.recall.findUniqueOrThrow({
      where: { id },
      select: { number: true, reportKey: true },
    });
    if (!recall.reportKey) {
      throw new DomainProblemException(
        '/problems/recall-report-unavailable',
        `Recall ${recall.number} has no report yet (step REPORT pending, failed or skipped).`,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.storage.createDownloadUrl(recall.reportKey, `recall-${recall.number}.pdf`, {
      inline: true,
    });
  }
}

function toResponse(row: RecallListRow): RecallResponse {
  return {
    id: row.id,
    number: row.number,
    originLot: row.originLot,
    reason: row.reason,
    severity: row.severity,
    status: row.status,
    lotsCount: row._count.lots,
    customersCount: row._count.customers,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    closedAt: row.closedAt,
  };
}

function toDetail(row: RecallDetailRow): RecallDetailResponse {
  return {
    ...toResponse(row),
    orchestration: row.executionArn ? 'STEP_FUNCTIONS' : 'LOCAL',
    lastError: row.lastError,
    hasReport: row.reportKey !== null,
    closingNotes: row.closingNotes,
    closedBy: row.closedBy,
    steps: row.steps.map((step) => ({
      name: step.name,
      position: step.position,
      status: step.status,
      attempts: step.attempts,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      error: step.error,
      output: step.output,
    })),
    lots: row.lots.map((item) => ({
      id: item.lot.id,
      code: item.lot.code,
      status: item.lot.status,
      product: item.lot.product,
      unit: item.lot.unit,
      depth: item.depth,
      balance: formatQuantity(item.balance),
      previousStatus: item.previousStatus,
      blockedAt: item.blockedAt,
    })),
    customers: row.customers.map((item) => ({
      customer: item.customer,
      shipmentsCount: item.shipmentsCount,
      shipmentNumbers: item.shipmentNumbers,
      quantities: toUnitQuantities(item.quantities),
    })),
  };
}

function toUnitQuantities(value: Prisma.JsonValue): UnitQuantity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const { unit, quantity } = (item ?? {}) as { unit?: Unit; quantity?: string };
    return unit && quantity ? [{ unit, quantity }] : [];
  });
}
