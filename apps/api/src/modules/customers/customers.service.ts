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
  CreateCustomerDto,
  CustomerResponse,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './customers.dto.js';

/** A empresa é detalhe interno do isolamento: nunca sai na resposta. */
const PUBLIC = { omit: { companyId: true } } as const;

@Injectable()
export class CustomersService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(query: ListCustomersQueryDto): Promise<Page<CustomerResponse>> {
    const where: Prisma.CustomerWhereInput = {
      ...statusFilter(query.status),
      ...(query.state && { state: query.state }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
          { document: { contains: query.q.replace(/\D/g, '') || query.q } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.db.client.customer.findMany({
        where,
        orderBy: orderBy(query.sort),
        ...pageArgs(query),
        ...PUBLIC,
      }),
      this.db.client.customer.count({ where }),
    ]);
    return toPage(data, total, query);
  }

  get(id: string): Promise<CustomerResponse> {
    return this.db.client.customer.findUniqueOrThrow({ where: { id }, ...PUBLIC });
  }

  create(dto: CreateCustomerDto): Promise<CustomerResponse> {
    // companyId é preenchido pela extensão de tenant (ADR 0004).
    return this.db.client.customer.create({
      data: { ...dto } as Prisma.CustomerUncheckedCreateInput,
      ...PUBLIC,
    });
  }

  update(id: string, dto: UpdateCustomerDto): Promise<CustomerResponse> {
    return this.db.client.customer.update({ where: { id }, data: dto, ...PUBLIC });
  }

  setActive(id: string, isActive: boolean): Promise<CustomerResponse> {
    return this.db.client.customer.update({ where: { id }, data: { isActive }, ...PUBLIC });
  }
}
