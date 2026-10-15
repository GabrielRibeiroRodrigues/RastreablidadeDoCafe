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
  CreateLocationDto,
  ListLocationsQueryDto,
  LocationResponse,
  UpdateLocationDto,
} from './locations.dto.js';

/** A empresa é detalhe interno do isolamento: nunca sai na resposta. */
const PUBLIC = { omit: { companyId: true } } as const;

@Injectable()
export class LocationsService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(query: ListLocationsQueryDto): Promise<Page<LocationResponse>> {
    const where: Prisma.LocationWhereInput = {
      ...statusFilter(query.status),
      ...(query.type && { type: query.type }),
      ...(query.q && {
        OR: [
          { code: { contains: query.q, mode: 'insensitive' } },
          { name: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.db.client.location.findMany({
        where,
        orderBy: orderBy(query.sort),
        ...pageArgs(query),
        ...PUBLIC,
      }),
      this.db.client.location.count({ where }),
    ]);
    return toPage(data, total, query);
  }

  get(id: string): Promise<LocationResponse> {
    return this.db.client.location.findUniqueOrThrow({ where: { id }, ...PUBLIC });
  }

  create(dto: CreateLocationDto): Promise<LocationResponse> {
    // companyId é preenchido pela extensão de tenant (ADR 0004).
    return this.db.client.location.create({
      data: { ...dto } as Prisma.LocationUncheckedCreateInput,
      ...PUBLIC,
    });
  }

  update(id: string, dto: UpdateLocationDto): Promise<LocationResponse> {
    return this.db.client.location.update({ where: { id }, data: dto, ...PUBLIC });
  }

  setActive(id: string, isActive: boolean): Promise<LocationResponse> {
    return this.db.client.location.update({ where: { id }, data: { isActive }, ...PUBLIC });
  }
}
