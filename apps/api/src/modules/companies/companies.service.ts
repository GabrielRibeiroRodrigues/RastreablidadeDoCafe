import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../tenancy/tenant-context.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import type { CompanyResponse, UpdateCompanyDto } from './companies.controller.js';

const COMPANY_FIELDS = {
  id: true,
  name: true,
  taxId: true,
  lotPrefix: true,
  createdAt: true,
} as const;

@Injectable()
export class CompaniesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  current(): Promise<CompanyResponse> {
    return this.db.client.company.findUniqueOrThrow({
      where: { id: this.tenant.requireCompanyId() },
      select: COMPANY_FIELDS,
    });
  }

  updateCurrent(dto: UpdateCompanyDto): Promise<CompanyResponse> {
    return this.db.client.company.update({
      where: { id: this.tenant.requireCompanyId() },
      data: { name: dto.name },
      select: COMPANY_FIELDS,
    });
  }
}
