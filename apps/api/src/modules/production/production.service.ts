import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { orderBy, pageArgs, toPage, type Page } from '../../common/http/pagination.js';
import {
  LocationType,
  LotStatus,
  MovementType,
  Prisma,
  type ProductType,
  type Unit,
} from '../../generated/prisma/client.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import {
  TenantPrismaService,
  type TenantTransaction,
} from '../../tenancy/tenant-prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DOCUMENT_KINDS, DocumentNumberService } from '../inventory/document-number.service.js';
import {
  assertSameRequest,
  isIdempotencyRace,
  type IdempotencyToken,
} from '../inventory/idempotency.js';
import { LotCodeService } from '../inventory/lot-code.service.js';
import { qualityData } from '../inventory/lots.service.js';
import { formatQuantity, Quantity, ZERO } from '../inventory/quantity.js';
import { StockLedgerService } from '../inventory/stock-ledger.service.js';
import {
  STAGE_RULES,
  type CreateProductionOrderDto,
  type ListProductionOrdersQueryDto,
  type ProductionOrderResponse,
} from './production.dto.js';

/** Massa em kg para o cálculo de rendimento (1 saca = 60 kg; unidades não têm massa). */
export function toKg(quantity: Quantity, unit: Unit): Quantity | null {
  if (unit === 'KG') return quantity;
  if (unit === 'BAG_60KG') return quantity.times(60);
  return null;
}

const PRODUCT_SELECT = { select: { id: true, sku: true, name: true, type: true } } as const;

const ORDER_INCLUDE = {
  outputLot: {
    select: {
      id: true,
      code: true,
      status: true,
      unit: true,
      initialQuantity: true,
      product: PRODUCT_SELECT,
    },
  },
  origins: {
    select: {
      quantity: true,
      parent: {
        select: { id: true, code: true, status: true, unit: true, product: PRODUCT_SELECT },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  user: { select: { id: true, name: true } },
} as const satisfies Prisma.ProductionOrderInclude;

type OrderWithRelations = Prisma.ProductionOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export interface ProductionResult {
  order: ProductionOrderResponse;
  replayed: boolean;
}

/**
 * Ordem de produção (torra, blend, beneficiamento, embalagem) executada de uma vez, numa transação:
 * consome os insumos (CONSUMPTION), cria o lote novo (PRODUCTION), grava a genealogia
 * (lot_origins) e calcula rendimento e perda. Faltou saldo em qualquer insumo → nada é gravado.
 */
@Injectable()
export class ProductionService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly ledger: StockLedgerService,
    private readonly lotCodes: LotCodeService,
    private readonly numbers: DocumentNumberService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateProductionOrderDto,
    idempotency?: IdempotencyToken,
  ): Promise<ProductionResult> {
    assertDistinctInputs(dto);
    const replay = await this.findReplay(idempotency);
    if (replay) return replay;

    try {
      const id = await this.db.transaction((tx) => this.execute(tx, dto, idempotency), {
        timeout: 20_000,
      });
      return { order: await this.get(id), replayed: false };
    } catch (error) {
      if (idempotency && isIdempotencyRace(error)) {
        const raced = await this.findReplay(idempotency);
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async execute(
    tx: TenantTransaction,
    dto: CreateProductionOrderDto,
    idempotency?: IdempotencyToken,
  ): Promise<string> {
    const rules = STAGE_RULES[dto.stage];
    const lotIds = [...new Set(dto.inputs.map((input) => input.lotId))];

    const [outputProduct, outputLocation, inputLots, company] = await Promise.all([
      tx.product.findUnique({ where: { id: dto.outputProductId } }),
      tx.location.findUnique({ where: { id: dto.outputLocationId } }),
      tx.lot.findMany({
        where: { id: { in: lotIds } },
        select: {
          id: true,
          code: true,
          unit: true,
          harvest: true,
          variety: true,
          product: { select: { type: true } },
        },
      }),
      tx.company.findUniqueOrThrow({
        where: { id: this.tenant.requireCompanyId() },
        select: { lotPrefix: true },
      }),
    ]);
    if (!outputProduct) throw new NotFoundException('Output product not found');
    if (!outputLocation) throw new NotFoundException('Output location not found');
    if (inputLots.length !== lotIds.length) throw new NotFoundException('Input lot not found');
    if (!outputProduct.isActive) {
      throw invalid(`Product ${outputProduct.sku} is inactive.`);
    }
    if (!rules.output.includes(outputProduct.type)) {
      throw invalid(
        `${dto.stage} must produce ${rules.output.join(' or ')}, not ${outputProduct.type}.`,
      );
    }
    const lotsById = new Map(inputLots.map((lot) => [lot.id, lot]));
    for (const lot of inputLots) {
      if (!rules.inputs.includes(lot.product.type)) {
        throw invalid(
          `${dto.stage} consumes ${rules.inputs.join(', ')}; lot ${lot.code} is ${lot.product.type}.`,
        );
      }
    }

    const performedAt = dto.performedAt ? new Date(dto.performedAt) : new Date();
    const outputQuantity = new Quantity(dto.outputQuantity);
    const mass = massBalance(dto, lotsById, outputQuantity, outputProduct.unit);
    const number = await this.numbers.next(tx, DOCUMENT_KINDS.productionOrder, performedAt);
    const code = await this.lotCodes.next(tx, company.lotPrefix, performedAt);

    // Lote de origem única herda safra e variedade (blend com origens diferentes, não).
    const inherited = {
      harvest: single(inputLots.map((lot) => lot.harvest)),
      variety: single(inputLots.map((lot) => lot.variety)),
    };
    const lot = await tx.lot.create({
      data: {
        ...inherited,
        roastLevel: outputProduct.defaultRoastLevel,
        ...(qualityData(dto.lot ?? {}) as Prisma.LotUncheckedCreateInput),
        code,
        productId: outputProduct.id,
        initialQuantity: outputQuantity,
        unit: outputProduct.unit,
        receivedAt: performedAt,
        status:
          outputLocation.type === LocationType.QUARANTINE
            ? LotStatus.QUARANTINE
            : LotStatus.AVAILABLE,
      },
    });

    const order = await tx.productionOrder.create({
      data: {
        number,
        stage: dto.stage,
        outputLotId: lot.id,
        inputMassKg: mass.inputKg,
        outputMassKg: mass.outputKg,
        yieldPercent: mass.yieldPercent,
        lossKg: mass.lossKg,
        notes: dto.notes ?? null,
        userId: this.tenant.requireUserId(),
        performedAt,
        idempotencyKey: idempotency?.key ?? null,
        requestHash: idempotency?.hash ?? null,
      } as Prisma.ProductionOrderUncheckedCreateInput,
    });

    // Ordem fixa de travas (lote, local) entre transações concorrentes → sem deadlock.
    const inputs = [...dto.inputs].sort(
      (a, b) => a.lotId.localeCompare(b.lotId) || a.locationId.localeCompare(b.locationId),
    );
    const consumedByLot = new Map<string, Quantity>();
    for (const input of inputs) {
      const quantity = new Quantity(input.quantity);
      await this.ledger.record(tx, {
        type: MovementType.CONSUMPTION,
        lotId: input.lotId,
        fromLocationId: input.locationId,
        quantity,
        occurredAt: performedAt,
        documentRef: number,
      });
      consumedByLot.set(input.lotId, (consumedByLot.get(input.lotId) ?? ZERO).plus(quantity));
    }

    await this.ledger.record(tx, {
      type: MovementType.PRODUCTION,
      lotId: lot.id,
      toLocationId: outputLocation.id,
      quantity: outputQuantity,
      occurredAt: performedAt,
      documentRef: number,
    });

    await tx.lotOrigin.createMany({
      data: [...consumedByLot].map(([parentLotId, quantity]) => ({
        childLotId: lot.id,
        parentLotId,
        productionOrderId: order.id,
        quantity,
      })) as Prisma.LotOriginCreateManyInput[],
    });

    await this.audit.record(
      {
        action: 'production_order.created',
        entityType: 'production_order',
        entityId: order.id,
        after: {
          number,
          stage: dto.stage,
          outputLot: { id: lot.id, code, quantity: formatQuantity(outputQuantity) },
          inputs: dto.inputs,
          yieldPercent: mass.yieldPercent,
          lossKg: mass.lossKg,
        },
      },
      tx,
    );
    return order.id;
  }

  async list(query: ListProductionOrdersQueryDto): Promise<Page<ProductionOrderResponse>> {
    const where: Prisma.ProductionOrderWhereInput = {
      ...(query.stage && { stage: query.stage }),
      ...(query.userId && { userId: query.userId }),
      AND: [
        query.q
          ? {
              OR: [
                { number: { contains: query.q, mode: 'insensitive' } },
                { outputLot: { code: { contains: query.q, mode: 'insensitive' } } },
              ],
            }
          : {},
        query.lotId
          ? {
              OR: [
                { outputLotId: query.lotId },
                { origins: { some: { parentLotId: query.lotId } } },
              ],
            }
          : {},
      ],
      ...((query.from || query.to) && {
        performedAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lt: new Date(query.to) }),
        },
      }),
    };
    const [orders, total] = await Promise.all([
      this.db.client.productionOrder.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: orderBy(query.sort),
        ...pageArgs(query),
      }),
      this.db.client.productionOrder.count({ where }),
    ]);
    return toPage(orders.map(toResponse), total, query);
  }

  async get(id: string): Promise<ProductionOrderResponse> {
    const order = await this.db.client.productionOrder.findUniqueOrThrow({
      where: { id },
      include: ORDER_INCLUDE,
    });
    return toResponse(order);
  }

  private async findReplay(idempotency?: IdempotencyToken): Promise<ProductionResult | undefined> {
    if (!idempotency) return undefined;
    const previous = await this.db.client.productionOrder.findFirst({
      where: { idempotencyKey: idempotency.key },
      select: { id: true, requestHash: true },
    });
    if (!previous) return undefined;
    assertSameRequest(previous.requestHash, idempotency);
    return { order: await this.get(previous.id), replayed: true };
  }
}

function massBalance(
  dto: CreateProductionOrderDto,
  lots: Map<string, { unit: Unit; product: { type: ProductType } }>,
  outputQuantity: Quantity,
  outputUnit: Unit,
) {
  // Embalagens (material) e insumos em unidades não entram no rendimento.
  const inputKg = dto.inputs.reduce((sum, input) => {
    const lot = lots.get(input.lotId);
    if (!lot || lot.product.type === 'PACKAGING') return sum;
    return sum.plus(toKg(new Quantity(input.quantity), lot.unit) ?? ZERO);
  }, ZERO);
  const outputKg = toKg(outputQuantity, outputUnit);

  if (!outputKg || inputKg.isZero()) {
    return { inputKg, outputKg, yieldPercent: null, lossKg: null };
  }
  if (outputKg.greaterThan(inputKg)) {
    throw invalid(
      `Output (${formatQuantity(outputKg)} kg) cannot exceed the input mass (${formatQuantity(inputKg)} kg).`,
    );
  }
  return {
    inputKg,
    outputKg,
    yieldPercent: outputKg.dividedBy(inputKg).times(100).toDecimalPlaces(2),
    lossKg: inputKg.minus(outputKg),
  };
}

function assertDistinctInputs(dto: CreateProductionOrderDto): void {
  const keys = dto.inputs.map((input) => `${input.lotId}:${input.locationId}`);
  if (new Set(keys).size !== keys.length) {
    throw invalid('Each (lotId, locationId) pair can appear only once in inputs.');
  }
}

function single<T>(values: Array<T | null>): T | null {
  const distinct = new Set(values);
  return distinct.size === 1 ? (values[0] ?? null) : null;
}

function invalid(detail: string): DomainProblemException {
  return new DomainProblemException('/problems/invalid-production', detail, HttpStatus.BAD_REQUEST);
}

function toResponse(order: OrderWithRelations): ProductionOrderResponse {
  return {
    id: order.id,
    number: order.number,
    stage: order.stage,
    performedAt: order.performedAt,
    output: {
      id: order.outputLot.id,
      code: order.outputLot.code,
      status: order.outputLot.status,
      product: order.outputLot.product,
      quantity: formatQuantity(order.outputLot.initialQuantity),
      unit: order.outputLot.unit,
    },
    inputs: order.origins.map((origin) => ({
      id: origin.parent.id,
      code: origin.parent.code,
      status: origin.parent.status,
      product: origin.parent.product,
      quantity: formatQuantity(origin.quantity),
      unit: origin.parent.unit,
    })),
    inputMassKg: formatQuantity(order.inputMassKg),
    outputMassKg: order.outputMassKg ? formatQuantity(order.outputMassKg) : null,
    yieldPercent: order.yieldPercent ? order.yieldPercent.toNumber() : null,
    lossKg: order.lossKg ? formatQuantity(order.lossKg) : null,
    notes: order.notes,
    user: order.user,
    createdAt: order.createdAt,
  };
}
