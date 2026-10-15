import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators.js';
import { ApiPageResponse, pageArgs, toPage, type Page } from '../../common/http/pagination.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { AuditLogResponse, ListAuditLogsQueryDto } from './audit.dto.js';

@Injectable()
export class AuditLogsService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(query: ListAuditLogsQueryDto): Promise<Page<AuditLogResponse>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
      ...(query.userId && { userId: query.userId }),
      ...(query.action &&
        (query.action.endsWith('.')
          ? { action: { startsWith: query.action } }
          : { action: query.action })),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lt: new Date(query.to) }),
        },
      }),
    };

    const [rows, total] = await Promise.all([
      this.db.client.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.db.client.auditLog.count({ where }),
    ]);

    return toPage(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        user: row.user,
        before: row.before,
        after: row.after,
        requestId: row.requestId,
        ip: row.ip,
        createdAt: row.createdAt,
      })),
      total,
      query,
    );
  }
}

/** Trilha de auditoria: só leitura (admin e auditor). Não há escrita pela API. */
@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly logs: AuditLogsService) {}

  @Get()
  @Roles('admin', 'auditor')
  @ApiPageResponse(AuditLogResponse)
  list(@Query() query: ListAuditLogsQueryDto): Promise<Page<AuditLogResponse>> {
    return this.logs.list(query);
  }
}
