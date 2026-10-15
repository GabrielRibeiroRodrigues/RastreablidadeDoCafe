import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import {
  LocationType,
  LotStatus,
  MovementType,
  type Prisma,
} from '../../generated/prisma/client.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import {
  TenantPrismaService,
  type TenantTransaction,
} from '../../tenancy/tenant-prisma.service.js';
import type { LotDetailResponse } from './inventory.dto.js';
import { assertSameRequest, isIdempotencyRace, type IdempotencyToken } from './idempotency.js';
import { LotCodeService } from './lot-code.service.js';
import { LotsService, qualityData } from './lots.service.js';
import { Quantity } from './quantity.js';
import type { CreateReceiptDto } from './receipts.dto.js';
import { StockLedgerService } from './stock-ledger.service.js';

export interface ReceiptResult {
  lot: LotDetailResponse;
  /** true quando a resposta é a repetição de um recebimento já feito com a mesma chave. */
  replayed: boolean;
}

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly ledger: StockLedgerService,
    private readonly lotCodes: LotCodeService,
    private readonly lots: LotsService,
  ) {}

  async receive(dto: CreateReceiptDto, idempotency?: IdempotencyToken): Promise<ReceiptResult> {
    const replay = await this.findReplay(idempotency);
    if (replay) return replay;

    try {
      const lotId = await this.db.transaction((tx) => this.createLot(tx, dto, idempotency));
      return { lot: await this.lots.get(lotId), replayed: false };
    } catch (error) {
      // Duas requisições simultâneas com a mesma chave: a perdedora devolve o resultado da outra.
      if (idempotency && isIdempotencyRace(error)) {
        const raced = await this.findReplay(idempotency);
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async createLot(
    tx: TenantTransaction,
    dto: CreateReceiptDto,
    idempotency?: IdempotencyToken,
  ): Promise<string> {
    const [product, location, company] = await Promise.all([
      tx.product.findUnique({ where: { id: dto.productId } }),
      tx.location.findUnique({ where: { id: dto.locationId } }),
      tx.company.findUniqueOrThrow({
        where: { id: this.tenant.requireCompanyId() },
        select: { lotPrefix: true },
      }),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    if (!location) throw new NotFoundException('Location not found');
    if (!product.isActive) {
      throw new DomainProblemException(
        '/problems/inactive-product',
        `Product ${product.sku} is inactive.`,
        HttpStatus.CONFLICT,
      );
    }
    if (dto.supplierId) {
      // FK do fornecedor é simples: a mesma empresa é garantida aqui (cliente escopado).
      const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) throw new NotFoundException('Supplier not found');
    }

    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    const code = await this.lotCodes.next(tx, company.lotPrefix, receivedAt);
    const {
      productId,
      supplierId,
      locationId: _locationId,
      quantity,
      receivedAt: _receivedAt,
      documentRef,
      ...quality
    } = dto;

    const lot = await tx.lot.create({
      data: {
        ...(qualityData(quality) as Prisma.LotUncheckedCreateInput),
        code,
        productId,
        supplierId: supplierId ?? null,
        initialQuantity: quantity,
        unit: product.unit,
        receivedAt,
        // Recebido direto na área de quarentena → lote nasce em quarentena.
        status:
          location.type === LocationType.QUARANTINE ? LotStatus.QUARANTINE : LotStatus.AVAILABLE,
      },
    });

    await this.ledger.record(tx, {
      type: MovementType.RECEIPT,
      lotId: lot.id,
      toLocationId: location.id,
      quantity: new Quantity(quantity),
      occurredAt: receivedAt,
      documentRef: documentRef ?? null,
      ...(idempotency && { idempotency }),
    });
    return lot.id;
  }

  private async findReplay(idempotency?: IdempotencyToken): Promise<ReceiptResult | undefined> {
    if (!idempotency) return undefined;
    const previous = await this.db.client.stockMovement.findFirst({
      where: { idempotencyKey: idempotency.key },
      select: { type: true, lotId: true, requestHash: true },
    });
    if (!previous) return undefined;

    if (previous.type !== MovementType.RECEIPT) assertSameRequest(null, idempotency);
    assertSameRequest(previous.requestHash, idempotency);
    return { lot: await this.lots.get(previous.lotId), replayed: true };
  }
}
