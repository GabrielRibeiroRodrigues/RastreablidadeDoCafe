import { Injectable, NotFoundException } from '@nestjs/common';
import { LotStatus } from '../generated/prisma/client.js';
import { PUBLIC_TOKEN_PATTERN } from '../modules/labels/public-token.js';
import { toPublicOrigin, uniqueOrigins } from '../modules/trace/public-origin.js';
import { TraceService } from '../modules/trace/trace.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from '../tenancy/tenant-context.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import type { PublicTraceResponse, PublicTraceStep } from './public-trace.dto.js';

/**
 * Página pública de rastreio (QR code da etiqueta).
 *
 * Por que este serviço fica fora de `src/modules/` e usa o `PrismaService` cru: a requisição é
 * anônima, então não há empresa no contexto e o cliente escopado (`TenantPrismaService`) recusaria
 * qualquer consulta. O token aleatório é a única chave que identifica o lote — e a empresa. Por
 * isso o cliente cru faz **uma** consulta só (lote pelo token → `id` e `companyId`); todo o resto
 * roda dentro de `TenantContext.runAs(companyId)`, com o mesmo isolamento de uma requisição
 * autenticada. O ESLint proíbe o `PrismaService` em `src/modules/**` justamente para que exceções
 * como esta fiquem isoladas e visíveis aqui.
 */
@Injectable()
export class PublicTraceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly db: TenantPrismaService,
    private readonly trace: TraceService,
  ) {}

  async byToken(token: string): Promise<PublicTraceResponse> {
    const found = PUBLIC_TOKEN_PATTERN.test(token)
      ? await this.prisma.lot.findUnique({
          where: { publicToken: token },
          select: { id: true, companyId: true },
        })
      : null;
    if (!found) throw new NotFoundException('Trace code not found');

    return this.tenant.runAs(found.companyId, () => this.build(found.id, found.companyId));
  }

  private async build(lotId: string, companyId: string): Promise<PublicTraceResponse> {
    const [lot, company, backward] = await Promise.all([
      this.db.client.lot.findUniqueOrThrow({
        where: { id: lotId },
        include: { product: { select: { name: true, type: true } } },
      }),
      this.db.client.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { name: true, brandColor: true, tagline: true, website: true },
      }),
      this.trace.backward(lotId),
    ]);

    const codeById = new Map(backward.nodes.map((node) => [node.id, node.code]));
    const chain: PublicTraceStep[] = backward.nodes
      .map((node) => {
        const incoming = backward.edges.filter((edge) => edge.childLotId === node.id);
        return {
          code: node.code,
          productName: node.product.name,
          productType: node.product.type,
          stage: incoming[0]?.productionOrder.stage ?? null,
          date: node.receivedAt,
          harvest: node.harvest,
          variety: node.variety,
          depth: node.depth,
          inputs: incoming.flatMap((edge) => codeById.get(edge.parentLotId) ?? []).sort(),
          origin: node.supplier ? toPublicOrigin(node.supplier) : null,
        };
      })
      // Da origem para o produto final.
      .sort((a, b) => b.depth - a.depth || a.code.localeCompare(b.code));

    return {
      companyName: company.name,
      brand: { color: company.brandColor, tagline: company.tagline, website: company.website },
      lot: {
        code: lot.code,
        productName: lot.product.name,
        productType: lot.product.type,
        harvest: lot.harvest,
        variety: lot.variety,
        roastLevel: lot.roastLevel,
        producedAt: lot.receivedAt,
        expiresAt: lot.expiresAt?.toISOString().slice(0, 10) ?? null,
        cuppingScore: lot.cuppingScore?.toNumber() ?? null,
        available: lot.status === LotStatus.AVAILABLE,
      },
      origins: uniqueOrigins(backward.origins.map(toPublicOrigin)),
      chain,
      truncated: backward.truncated,
    };
  }
}
