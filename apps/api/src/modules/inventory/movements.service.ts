import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user.js';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { orderBy, pageArgs, toPage, type Page } from '../../common/http/pagination.js';
import { MovementType, type Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import type { MovementResponse } from './inventory.dto.js';
import { MOVEMENT_INCLUDE, toMovementResponse } from './inventory.mappers.js';
import { assertSameRequest, isIdempotencyRace, type IdempotencyToken } from './idempotency.js';
import type {
  CreateMovementDto,
  ListMovementsQueryDto,
  ReverseMovementDto,
} from './movements.dto.js';
import { Quantity } from './quantity.js';
import { StockLedgerService } from './stock-ledger.service.js';

export interface MovementResult {
  movement: MovementResponse;
  replayed: boolean;
}

@Injectable()
export class MovementsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly ledger: StockLedgerService,
  ) {}

  async create(
    dto: CreateMovementDto,
    user: AuthUser,
    idempotency?: IdempotencyToken,
  ): Promise<MovementResult> {
    if (dto.type === MovementType.ADJUSTMENT) {
      // Ajuste mexe em saldo sem documento externo: só admin, e sempre com motivo.
      if (!user.roles.includes('admin')) {
        throw new ForbiddenException('Only an admin can post inventory adjustments');
      }
      if (!dto.reason) {
        throw new DomainProblemException(
          '/problems/invalid-movement',
          'An adjustment requires a reason.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    return this.idempotent(idempotency, () =>
      this.db.transaction((tx) =>
        this.ledger.record(tx, {
          type: dto.type,
          lotId: dto.lotId,
          fromLocationId: dto.fromLocationId ?? null,
          toLocationId: dto.toLocationId ?? null,
          quantity: new Quantity(dto.quantity),
          ...(dto.occurredAt && { occurredAt: new Date(dto.occurredAt) }),
          documentRef: dto.documentRef ?? null,
          reason: dto.reason ?? null,
          ...(idempotency && { idempotency }),
        }),
      ),
    );
  }

  /**
   * Estorno: nova linha com origem e destino trocados. A original continua intacta (imutável);
   * cada movimentação só pode ser estornada uma vez, e um estorno não pode ser estornado.
   */
  async reverse(id: string, dto: ReverseMovementDto): Promise<MovementResponse> {
    const reversal = await this.db.transaction(async (tx) => {
      const original = await tx.stockMovement.findUnique({
        where: { id },
        include: { reversedBy: { select: { id: true } } },
      });
      if (!original) throw new NotFoundException('Movement not found');
      if (original.type === MovementType.REVERSAL) {
        throw new DomainProblemException(
          '/problems/invalid-reversal',
          'A reversal cannot be reversed; post a new movement instead.',
          HttpStatus.CONFLICT,
        );
      }
      if (original.reversedBy) {
        throw new DomainProblemException(
          '/problems/already-reversed',
          'This movement was already reversed.',
          HttpStatus.CONFLICT,
          { reversalId: original.reversedBy.id },
        );
      }

      return this.ledger.record(tx, {
        type: MovementType.REVERSAL,
        lotId: original.lotId,
        fromLocationId: original.toLocationId,
        toLocationId: original.fromLocationId,
        quantity: original.quantity,
        documentRef: original.documentRef,
        reason: dto.reason,
        reversalOfId: original.id,
      });
    });
    return this.get(reversal.id);
  }

  async list(query: ListMovementsQueryDto): Promise<Page<MovementResponse>> {
    const where: Prisma.StockMovementWhereInput = {
      ...(query.lotId && { lotId: query.lotId }),
      ...(query.type && { type: query.type }),
      ...(query.userId && { userId: query.userId }),
      ...(query.locationId && {
        OR: [{ fromLocationId: query.locationId }, { toLocationId: query.locationId }],
      }),
      ...((query.from || query.to) && {
        occurredAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lt: new Date(query.to) }),
        },
      }),
    };

    const [movements, total] = await Promise.all([
      this.db.client.stockMovement.findMany({
        where,
        include: MOVEMENT_INCLUDE,
        orderBy: orderBy(query.sort),
        ...pageArgs(query),
      }),
      this.db.client.stockMovement.count({ where }),
    ]);
    return toPage(movements.map(toMovementResponse), total, query);
  }

  async get(id: string): Promise<MovementResponse> {
    const movement = await this.db.client.stockMovement.findUniqueOrThrow({
      where: { id },
      include: MOVEMENT_INCLUDE,
    });
    return toMovementResponse(movement);
  }

  /** Executa `write` uma única vez por chave; repetições devolvem a movimentação original. */
  private async idempotent(
    idempotency: IdempotencyToken | undefined,
    write: () => Promise<{ id: string }>,
  ): Promise<MovementResult> {
    const replay = await this.findReplay(idempotency);
    if (replay) return replay;

    try {
      const created = await write();
      return { movement: await this.get(created.id), replayed: false };
    } catch (error) {
      if (idempotency && isIdempotencyRace(error)) {
        const raced = await this.findReplay(idempotency);
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async findReplay(idempotency?: IdempotencyToken): Promise<MovementResult | undefined> {
    if (!idempotency) return undefined;
    const previous = await this.db.client.stockMovement.findFirst({
      where: { idempotencyKey: idempotency.key },
      select: { id: true, requestHash: true },
    });
    if (!previous) return undefined;

    assertSameRequest(previous.requestHash, idempotency);
    return { movement: await this.get(previous.id), replayed: true };
  }
}
