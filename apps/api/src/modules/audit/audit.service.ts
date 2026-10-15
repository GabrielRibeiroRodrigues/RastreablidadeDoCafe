import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import {
  TenantPrismaService,
  type TenantTransaction,
} from '../../tenancy/tenant-prisma.service.js';

export interface AuditEntry {
  /** `<entidade>.<verbo>`, ex.: `lot.status_changed`, `recall.created`. */
  action: string;
  /** Ex.: `lot`, `recall`, `non_conformity`, `movement`. */
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trilha de auditoria (append-only). Empresa, usuário, requestId e IP vêm do contexto (CLS), nunca
 * do chamador. Passe o `tx` da operação para que a auditoria seja gravada (ou desfeita) junto com ela.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async record(entry: AuditEntry, tx?: TenantTransaction): Promise<void> {
    const data = this.toData(entry);
    if (tx) {
      await tx.auditLog.create({ data });
    } else {
      await this.db.client.auditLog.create({ data });
    }
    this.tenant.markAudited();
  }

  /** Vários registros de uma vez (ex.: lotes bloqueados por um recall). */
  async recordMany(entries: AuditEntry[], tx?: TenantTransaction): Promise<void> {
    if (entries.length === 0) return;
    const data = entries.map((entry) => this.toData(entry));
    if (tx) {
      await tx.auditLog.createMany({ data });
    } else {
      await this.db.client.auditLog.createMany({ data });
    }
    this.tenant.markAudited();
  }

  private toData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    const userId = this.tenant.userId;
    return {
      // Forçado pela extensão de tenant; declarado aqui só para satisfazer o tipo.
      companyId: this.tenant.requireCompanyId(),
      // Jobs rodam como "system", que não é um usuário: fica null.
      userId: userId && UUID.test(userId) ? userId : null,
      action: entry.action.slice(0, 80),
      entityType: entry.entityType.slice(0, 60),
      entityId: entry.entityId ? entry.entityId.slice(0, 64) : null,
      ...(entry.before != null && { before: toJson(entry.before) }),
      ...(entry.after != null && { after: toJson(entry.after) }),
      requestId: this.tenant.requestId?.slice(0, 128) ?? null,
      ip: this.tenant.ip ?? null,
    };
  }
}

/** Decimal/Date → string, `undefined` removido: o JSON gravado é exatamente o que a API exibiria. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
