import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../tenancy/tenant-context.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CompanyResponse, UpdateCompanyDto } from './companies.controller.js';

const COMPANY_FIELDS = {
  id: true,
  name: true,
  taxId: true,
  lotPrefix: true,
  brandColor: true,
  tagline: true,
  website: true,
  createdAt: true,
} as const;

@Injectable()
export class CompaniesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  current(): Promise<CompanyResponse> {
    return this.db.client.company.findUniqueOrThrow({
      where: { id: this.tenant.requireCompanyId() },
      select: COMPANY_FIELDS,
    });
  }

  updateCurrent(dto: UpdateCompanyDto): Promise<CompanyResponse> {
    const id = this.tenant.requireCompanyId();
    return this.db.transaction(async (tx) => {
      const before = await tx.company.findUniqueOrThrow({
        where: { id },
        select: { name: true, brandColor: true, tagline: true, website: true },
      });
      const updated = await tx.company.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.brandColor !== undefined && {
            brandColor: dto.brandColor?.toLowerCase() ?? null,
          }),
          ...(dto.tagline !== undefined && { tagline: dto.tagline }),
          ...(dto.website !== undefined && { website: dto.website }),
        },
        select: COMPANY_FIELDS,
      });
      await this.audit.record(
        {
          action: 'company.updated',
          entityType: 'company',
          entityId: id,
          before,
          after: {
            name: updated.name,
            brandColor: updated.brandColor,
            tagline: updated.tagline,
            website: updated.website,
          },
        },
        tx,
      );
      return updated;
    });
  }
}
