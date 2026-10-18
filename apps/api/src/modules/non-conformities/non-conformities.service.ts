import { InboxService } from '../../notifications/inbox.service.js';
import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { pageArgs, toPage, type Page } from '../../common/http/pagination.js';
import {
  LotStatus,
  MovementType,
  NonConformityStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import {
  TenantPrismaService,
  type TenantTransaction,
} from '../../tenancy/tenant-prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DOCUMENT_KINDS, DocumentNumberService } from '../inventory/document-number.service.js';
import { assertNotUnderOpenRecall } from '../inventory/lots.service.js';
import { formatQuantity, ZERO } from '../inventory/quantity.js';
import { StockLedgerService } from '../inventory/stock-ledger.service.js';
import type {
  ListNonConformitiesQueryDto,
  NonConformityResponse,
  OpenNonConformityDto,
  ResolveNonConformityDto,
} from './non-conformities.dto.js';

const USER_SELECT = { select: { id: true, name: true } } as const;

const NC_INCLUDE = {
  lot: { select: { id: true, code: true, status: true, unit: true } },
  openedBy: USER_SELECT,
  resolvedBy: USER_SELECT,
} as const satisfies Prisma.NonConformityInclude;

type NcRow = Prisma.NonConformityGetPayload<{ include: typeof NC_INCLUDE }>;

/**
 * Não conformidade de qualidade (Semana 4).
 *
 * - **Abrir** coloca o lote em quarentena (se estava disponível; bloqueado/consumido fica como está).
 * - **Liberar** devolve o lote a disponível — se não houver outra NC aberta nem recall em aberto.
 * - **Descartar** baixa todo o saldo do lote (ajuste de perda por local, documento = número da NC)
 *   e o lote termina consumido.
 *
 * Tudo numa transação com o lote travado (`FOR UPDATE`), como as movimentações (ADR 0007).
 */
@Injectable()
export class NonConformitiesService {
  private readonly logger = new Logger(NonConformitiesService.name);

  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly ledger: StockLedgerService,
    private readonly numbers: DocumentNumberService,
    private readonly audit: AuditService,
    private readonly inbox: InboxService,
  ) {}

  async open(dto: OpenNonConformityDto): Promise<NonConformityResponse> {
    const id = await this.db.transaction(async (tx) => {
      const lot = await this.ledger.lockLot(tx, dto.lotId);
      const number = await this.numbers.next(tx, DOCUMENT_KINDS.nonConformity);
      const nc = await tx.nonConformity.create({
        data: {
          number,
          lotId: lot.id,
          type: dto.type,
          description: dto.description,
          openedById: this.tenant.requireUserId(),
        } as Prisma.NonConformityUncheckedCreateInput,
      });

      // Só um lote disponível entra em quarentena; bloqueado ou consumido mantém o status.
      if (lot.status === LotStatus.AVAILABLE) {
        await tx.lot.update({ where: { id: lot.id }, data: { status: LotStatus.QUARANTINE } });
        await this.audit.record(
          {
            action: 'lot.status_changed',
            entityType: 'lot',
            entityId: lot.id,
            before: { code: lot.code, status: lot.status },
            after: { code: lot.code, status: LotStatus.QUARANTINE, nonConformity: number },
          },
          tx,
        );
      }

      await this.audit.record(
        {
          action: 'non_conformity.opened',
          entityType: 'non_conformity',
          entityId: nc.id,
          after: {
            number,
            lot: lot.code,
            type: dto.type,
            description: dto.description,
            lotStatusBefore: lot.status,
          },
        },
        tx,
      );
      return nc.id;
    });
    await this.notifyOpened(id);
    return this.get(id);
  }

  /** Aviso na central (admin e operador). Falha aqui não desfaz a NC, que já foi gravada. */
  private async notifyOpened(id: string): Promise<void> {
    try {
      const nc = await this.db.client.nonConformity.findUniqueOrThrow({
        where: { id },
        select: { number: true, description: true, lot: { select: { code: true } } },
      });
      await this.inbox.deliver({
        event: 'non_conformity.opened',
        companyId: this.tenant.requireCompanyId(),
        subject: `Não conformidade ${nc.number} no lote ${nc.lot.code}`,
        body: nc.description,
        data: { nonConformityId: id, number: nc.number, lot: nc.lot.code },
      });
    } catch (error) {
      this.logger.error({ err: error, id }, 'Failed to notify the opened non-conformity');
    }
  }

  async release(id: string, dto: ResolveNonConformityDto): Promise<NonConformityResponse> {
    await this.db.transaction(async (tx) => {
      const nc = await this.lockOpen(tx, id);
      const lot = await this.ledger.lockLot(tx, nc.lotId);
      await this.resolve(tx, nc.id, NonConformityStatus.RELEASED, dto.justification);

      // O lote só volta a disponível se esta era a única NC aberta e ele não está num recall.
      let lotStatusAfter: LotStatus = lot.status;
      if (lot.status === LotStatus.QUARANTINE) {
        const otherOpen = await tx.nonConformity.count({
          where: { lotId: lot.id, status: NonConformityStatus.OPEN, id: { not: nc.id } },
        });
        if (otherOpen === 0) {
          await assertNotUnderOpenRecall(tx, lot);
          await tx.lot.update({ where: { id: lot.id }, data: { status: LotStatus.AVAILABLE } });
          lotStatusAfter = LotStatus.AVAILABLE;
          await this.audit.record(
            {
              action: 'lot.status_changed',
              entityType: 'lot',
              entityId: lot.id,
              before: { code: lot.code, status: lot.status },
              after: { code: lot.code, status: lotStatusAfter, nonConformity: nc.number },
            },
            tx,
          );
        }
      }

      await this.audit.record(
        {
          action: 'non_conformity.released',
          entityType: 'non_conformity',
          entityId: nc.id,
          before: { status: NonConformityStatus.OPEN, lotStatus: lot.status },
          after: {
            status: NonConformityStatus.RELEASED,
            justification: dto.justification,
            lotStatus: lotStatusAfter,
          },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async discard(id: string, dto: ResolveNonConformityDto): Promise<NonConformityResponse> {
    await this.db.transaction(
      async (tx) => {
        const nc = await this.lockOpen(tx, id);
        const lot = await this.ledger.lockLot(tx, nc.lotId);
        const balances = await this.ledger.balances(tx, lot.id);

        // Perda de todo o saldo retido, local a local, em ordem fixa — pelo razão (imutável).
        const losses: Array<{ locationId: string; quantity: string; movementId: string }> = [];
        for (const [locationId, quantity] of [...balances].sort(([a], [b]) => a.localeCompare(b))) {
          if (quantity.lessThanOrEqualTo(ZERO)) continue;
          const movement = await this.ledger.record(tx, {
            type: MovementType.ADJUSTMENT,
            lotId: lot.id,
            fromLocationId: locationId,
            quantity,
            documentRef: nc.number,
            reason: `Descarte por não conformidade ${nc.number}: ${dto.justification}`.slice(
              0,
              500,
            ),
            allowRestrictedLot: true,
          });
          losses.push({ locationId, quantity: formatQuantity(quantity), movementId: movement.id });
        }

        await tx.lot.update({ where: { id: lot.id }, data: { status: LotStatus.CONSUMED } });
        await this.resolve(tx, nc.id, NonConformityStatus.DISCARDED, dto.justification);

        await this.audit.record(
          {
            action: 'lot.status_changed',
            entityType: 'lot',
            entityId: lot.id,
            before: { code: lot.code, status: lot.status },
            after: { code: lot.code, status: LotStatus.CONSUMED, nonConformity: nc.number },
          },
          tx,
        );
        await this.audit.record(
          {
            action: 'non_conformity.discarded',
            entityType: 'non_conformity',
            entityId: nc.id,
            before: { status: NonConformityStatus.OPEN, lotStatus: lot.status },
            after: {
              status: NonConformityStatus.DISCARDED,
              justification: dto.justification,
              losses,
            },
          },
          tx,
        );
      },
      { timeout: 20_000 },
    );
    return this.get(id);
  }

  async list(query: ListNonConformitiesQueryDto): Promise<Page<NonConformityResponse>> {
    const where: Prisma.NonConformityWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.type && { type: query.type }),
      ...(query.lotId && { lotId: query.lotId }),
    };
    const [rows, total] = await Promise.all([
      this.db.client.nonConformity.findMany({
        where,
        include: NC_INCLUDE,
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.db.client.nonConformity.count({ where }),
    ]);
    return toPage(rows.map(toResponse), total, query);
  }

  async get(id: string): Promise<NonConformityResponse> {
    const row = await this.db.client.nonConformity.findUniqueOrThrow({
      where: { id },
      include: NC_INCLUDE,
    });
    return toResponse(row);
  }

  /** Trava a NC (duas resoluções simultâneas não passam) e exige que esteja aberta. */
  private async lockOpen(tx: TenantTransaction, id: string) {
    const rows = await tx.sql<
      Array<{ id: string; number: string; lot_id: string; status: string }>
    >(
      (companyId) => Prisma.sql`
        SELECT id, number, lot_id, status FROM non_conformities
        WHERE company_id = ${companyId}::uuid AND id = ${id}::uuid
        FOR UPDATE`,
    );
    const nc = rows[0];
    if (!nc) throw new NotFoundException('Non-conformity not found');
    if (nc.status !== NonConformityStatus.OPEN) {
      throw new DomainProblemException(
        '/problems/non-conformity-not-open',
        `Non-conformity ${nc.number} is already ${nc.status}.`,
        HttpStatus.CONFLICT,
        { ncStatus: nc.status },
      );
    }
    return { id: nc.id, number: nc.number, lotId: nc.lot_id };
  }

  private async resolve(
    tx: TenantTransaction,
    id: string,
    status: NonConformityStatus,
    justification: string,
  ): Promise<void> {
    await tx.nonConformity.update({
      where: { id },
      data: {
        status,
        resolution: justification,
        resolvedById: this.tenant.requireUserId(),
        resolvedAt: new Date(),
      },
    });
  }
}

function toResponse(row: NcRow): NonConformityResponse {
  return {
    id: row.id,
    number: row.number,
    lot: row.lot,
    type: row.type,
    description: row.description,
    status: row.status,
    openedBy: row.openedBy,
    openedAt: row.openedAt,
    resolution: row.resolution,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt,
  };
}
