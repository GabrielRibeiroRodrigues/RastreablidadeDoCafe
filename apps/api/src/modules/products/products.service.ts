import { Injectable } from '@nestjs/common';
import {
  orderBy,
  pageArgs,
  statusFilter,
  toPage,
  type Page,
} from '../../common/http/pagination.js';
import { ValidationProblemException } from '../../common/http/validation.js';
import { ProductType, type Prisma, type RoastLevel } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import type {
  CreateProductDto,
  ListProductsQueryDto,
  ProductResponse,
  UpdateProductDto,
} from './products.dto.js';

/** A empresa é detalhe interno do isolamento: nunca sai na resposta. */
const PUBLIC = { omit: { companyId: true } } as const;

/** Só produtos que passam por torra têm grau de torra. */
const ROASTABLE: ReadonlySet<ProductType> = new Set([ProductType.ROASTED, ProductType.BLEND]);

@Injectable()
export class ProductsService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(query: ListProductsQueryDto): Promise<Page<ProductResponse>> {
    const where: Prisma.ProductWhereInput = {
      ...statusFilter(query.status),
      ...(query.type && { type: query.type }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { sku: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.db.client.product.findMany({
        where,
        orderBy: orderBy(query.sort),
        ...pageArgs(query),
        ...PUBLIC,
      }),
      this.db.client.product.count({ where }),
    ]);
    return toPage(data, total, query);
  }

  get(id: string): Promise<ProductResponse> {
    return this.db.client.product.findUniqueOrThrow({ where: { id }, ...PUBLIC });
  }

  create(dto: CreateProductDto): Promise<ProductResponse> {
    assertRoastLevel(dto.type, dto.defaultRoastLevel);
    // companyId é preenchido pela extensão de tenant (ADR 0004).
    return this.db.client.product.create({
      data: { ...dto } as Prisma.ProductUncheckedCreateInput,
      ...PUBLIC,
    });
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    if (dto.type !== undefined || dto.defaultRoastLevel !== undefined) {
      const current = await this.get(id);
      assertRoastLevel(
        dto.type ?? current.type,
        dto.defaultRoastLevel === undefined ? current.defaultRoastLevel : dto.defaultRoastLevel,
      );
    }
    return this.db.client.product.update({ where: { id }, data: dto, ...PUBLIC });
  }

  setActive(id: string, isActive: boolean): Promise<ProductResponse> {
    return this.db.client.product.update({ where: { id }, data: { isActive }, ...PUBLIC });
  }
}

function assertRoastLevel(type: ProductType, roastLevel: RoastLevel | null | undefined): void {
  if (roastLevel && !ROASTABLE.has(type)) {
    throw new ValidationProblemException([
      {
        field: 'defaultRoastLevel',
        messages: ['defaultRoastLevel is only allowed for ROASTED and BLEND products'],
      },
    ]);
  }
}
