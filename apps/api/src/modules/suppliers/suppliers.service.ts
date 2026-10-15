import { Injectable } from '@nestjs/common';
import {
  orderBy,
  pageArgs,
  statusFilter,
  toPage,
  type Page,
} from '../../common/http/pagination.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import type {
  CreateSupplierDto,
  ListSuppliersQueryDto,
  SupplierResponse,
  UpdateSupplierDto,
} from './suppliers.dto.js';

/** A empresa é detalhe interno do isolamento: nunca sai na resposta. */
const PUBLIC = { omit: { companyId: true } } as const;

@Injectable()
export class SuppliersService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(query: ListSuppliersQueryDto): Promise<Page<SupplierResponse>> {
    const where: Prisma.SupplierWhereInput = {
      ...statusFilter(query.status),
      ...(query.type && { type: query.type }),
      ...(query.state && { state: query.state }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { farmName: { contains: query.q, mode: 'insensitive' } },
          { document: { contains: query.q.replace(/\D/g, '') || query.q } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.db.client.supplier.findMany({
        where,
        orderBy: orderBy(query.sort),
        ...pageArgs(query),
        ...PUBLIC,
      }),
      this.db.client.supplier.count({ where }),
    ]);
    return toPage(data, total, query);
  }

  get(id: string): Promise<SupplierResponse> {
    return this.db.client.supplier.findUniqueOrThrow({ where: { id }, ...PUBLIC });
  }

  create(dto: CreateSupplierDto): Promise<SupplierResponse> {
    // companyId é preenchido pela extensão de tenant (ADR 0004).
    return this.db.client.supplier.create({
      data: { ...dto } as Prisma.SupplierUncheckedCreateInput,
      ...PUBLIC,
    });
  }

  update(id: string, dto: UpdateSupplierDto): Promise<SupplierResponse> {
    return this.db.client.supplier.update({ where: { id }, data: dto, ...PUBLIC });
  }

  setActive(id: string, isActive: boolean): Promise<SupplierResponse> {
    return this.db.client.supplier.update({ where: { id }, data: { isActive }, ...PUBLIC });
  }
}
