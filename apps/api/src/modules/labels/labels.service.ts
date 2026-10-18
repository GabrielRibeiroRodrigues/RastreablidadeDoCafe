import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import type { ProductType, RoastLevel } from '../../generated/prisma/client.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { toPublicOrigin, uniqueOrigins } from '../trace/public-origin.js';
import { TraceService } from '../trace/trace.service.js';
import { randomUUID } from 'node:crypto';
import { buildLabelPdf, buildLabelsPdf, type LabelData } from './label-pdf.js';
import type { LabelBatchResponse, LabelResponse } from './labels.dto.js';
import { generatePublicToken } from './public-token.js';

const PDF = 'application/pdf';

const ROAST_LEVEL_PT: Record<RoastLevel, string> = {
  LIGHT: 'Clara',
  MEDIUM_LIGHT: 'Média-clara',
  MEDIUM: 'Média',
  MEDIUM_DARK: 'Média-escura',
  DARK: 'Escura',
};

const DATE_LABEL: Record<ProductType, string> = {
  GREEN: 'Recebido em',
  ROASTED: 'Torrado em',
  BLEND: 'Produzido em',
  PACKAGING: 'Produzido em',
};

/** Datas exibidas no fuso da operação (Brasil). */
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });
/** Colunas `date` chegam como meia-noite UTC: formatar em UTC para não voltar um dia. */
const dateOnlyFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

/**
 * Etiqueta do lote: PDF com QR code para a página pública. O PDF fica no bucket privado em
 * `{companyId}/labels/{lotId}.pdf` (sobrescrito a cada geração) e é entregue por URL pré-assinada.
 */
@Injectable()
export class LabelsService {
  private readonly publicWebUrl: string;

  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly storage: StorageService,
    private readonly trace: TraceService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.publicWebUrl = config.get('PUBLIC_WEB_URL', { infer: true });
  }

  async generate(lotId: string): Promise<LabelResponse> {
    this.storage.assertConfigured();
    const companyId = this.tenant.requireCompanyId();
    const company = await this.company(companyId);
    const { data, lot } = await this.labelFor(lotId, company);

    const pdf = await buildLabelPdf(data);
    const key = `${companyId}/labels/${lot.id}.pdf`;
    await this.storage.putObject(key, pdf, PDF);
    await this.audit.record({
      action: 'label.generated',
      entityType: 'lot',
      entityId: lot.id,
      after: { code: lot.code, storageKey: key, publicUrl: data.publicUrl },
    });
    const download = await this.storage.createDownloadUrl(key, `etiqueta-${lot.code}.pdf`, {
      inline: true,
    });
    return { ...download, publicUrl: data.publicUrl };
  }

  /**
   * Várias etiquetas num só PDF (uma por página, na ordem pedida) para imprimir de uma vez.
   * Lote inexistente ou de outra empresa: 404 para o pedido inteiro.
   */
  async generateBatch(lotIds: string[]): Promise<LabelBatchResponse> {
    this.storage.assertConfigured();
    const companyId = this.tenant.requireCompanyId();
    const company = await this.company(companyId);
    const ids = [...new Set(lotIds)];
    const labels = [];
    // Em sequência: o rastreio de cada lote é uma consulta recursiva; não vale saturar o pool.
    for (const id of ids) labels.push(await this.labelFor(id, company));

    const pdf = await buildLabelsPdf(labels.map((label) => label.data));
    const key = `${companyId}/labels/batch-${randomUUID()}.pdf`;
    await this.storage.putObject(key, pdf, PDF);
    await this.audit.record({
      action: 'label.batch_generated',
      entityType: 'lot',
      after: { lots: labels.map((label) => label.lot.code), storageKey: key },
    });
    const download = await this.storage.createDownloadUrl(
      key,
      `etiquetas-${labels.length}-lotes.pdf`,
      { inline: true },
    );
    return { ...download, count: labels.length };
  }

  private company(companyId: string) {
    return this.db.client.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { name: true, brandColor: true },
    });
  }

  /** Dados publicáveis de um lote para a etiqueta (cria o token público se ainda não houver). */
  private async labelFor(lotId: string, company: { name: string; brandColor: string | null }) {
    // 404 se o lote não existir ou for de outra empresa.
    const lot = await this.db.client.lot.findUniqueOrThrow({
      where: { id: lotId },
      include: { product: { select: { name: true, type: true } } },
    });
    const [backward, token] = await Promise.all([
      this.trace.backward(lotId),
      this.ensurePublicToken(lotId, lot.publicToken),
    ]);

    const data: LabelData = {
      companyName: company.name,
      brandColor: company.brandColor,
      productName: lot.product.name,
      lotCode: lot.code,
      harvest: lot.harvest,
      variety: lot.variety,
      roastLevel: lot.roastLevel ? ROAST_LEVEL_PT[lot.roastLevel] : null,
      dateLabel: DATE_LABEL[lot.product.type],
      date: dateTimeFormat.format(lot.receivedAt),
      expiresAt: lot.expiresAt ? dateOnlyFormat.format(lot.expiresAt) : null,
      cuppingScore: lot.cuppingScore
        ? lot.cuppingScore.toNumber().toLocaleString('pt-BR', { maximumFractionDigits: 2 })
        : null,
      origins: uniqueOrigins(backward.origins.map(toPublicOrigin)),
      publicUrl: `${this.publicWebUrl}/rastreio/${token}`,
    };
    return { data, lot };
  }

  /**
   * Token gerado sob demanda na primeira etiqueta e nunca alterado. O `updateMany` condicional
   * (`publicToken: null`) resolve a corrida entre duas gerações simultâneas: só a primeira grava,
   * e ambas releem o valor que ficou.
   */
  private async ensurePublicToken(lotId: string, current: string | null): Promise<string> {
    if (current) return current;
    await this.db.client.lot.updateMany({
      where: { id: lotId, publicToken: null },
      data: { publicToken: generatePublicToken() },
    });
    const { publicToken } = await this.db.client.lot.findUniqueOrThrow({
      where: { id: lotId },
      select: { publicToken: true },
    });
    if (!publicToken) throw new Error(`Public token was not set for lot ${lotId}`);
    return publicToken;
  }
}
