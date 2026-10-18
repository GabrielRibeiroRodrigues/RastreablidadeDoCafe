import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.js';
import { ValidationProblemException } from '../../common/http/validation.js';
import { AttachmentStatus, type Attachment, type Prisma } from '../../generated/prisma/client.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import type {
  AttachmentResponse,
  CreateAttachmentDto,
  CreateAttachmentResponse,
  DownloadUrlResponse,
} from './attachments.dto.js';

/**
 * Upload direto navegador → bucket (POST pré-assinado), em duas etapas: `requestUpload` registra
 * o anexo como PENDING e devolve o formulário; `confirm` verifica o objeto (HEAD) e o marca
 * UPLOADED. Só anexos UPLOADED aparecem na listagem e podem ser baixados.
 */
@Injectable()
export class AttachmentsService {
  private readonly maxBytes: number;

  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.maxBytes = config.get('ATTACHMENT_MAX_BYTES', { infer: true });
  }

  async requestUpload(lotId: string, dto: CreateAttachmentDto): Promise<CreateAttachmentResponse> {
    this.storage.assertConfigured();
    if (dto.sizeBytes > this.maxBytes) {
      throw new ValidationProblemException([
        { field: 'sizeBytes', messages: [`sizeBytes must not exceed ${this.maxBytes} bytes`] },
      ]);
    }
    await this.assertLot(lotId);

    const companyId = this.tenant.requireCompanyId();
    const attachment = await this.db.client.attachment.create({
      data: {
        lotId,
        fileName: dto.fileName,
        contentType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        // Chave por empresa e lote; o UUID evita colisões e não expõe o nome do arquivo.
        storageKey: `${companyId}/lots/${lotId}/${randomUUID()}`,
        uploadedById: this.requireUserId(),
      } as Prisma.AttachmentUncheckedCreateInput,
    });

    // O limite exato é o tamanho declarado: o S3 recusa qualquer arquivo maior.
    const upload = await this.storage.createUploadPost(
      attachment.storageKey,
      attachment.contentType,
      attachment.sizeBytes,
    );
    return { attachment: toResponse(attachment), upload };
  }

  async confirm(lotId: string, id: string): Promise<AttachmentResponse> {
    this.storage.assertConfigured();
    const attachment = await this.find(lotId, id);
    if (attachment.status === AttachmentStatus.UPLOADED) {
      return toResponse(attachment);
    }

    const object = await this.storage.head(attachment.storageKey);
    if (!object) {
      throw new ConflictException('The file has not been uploaded yet');
    }
    if (object.sizeBytes !== attachment.sizeBytes) {
      throw new ConflictException(
        `Uploaded file size (${object.sizeBytes}) differs from the declared size (${attachment.sizeBytes})`,
      );
    }
    if (object.contentType !== attachment.contentType) {
      throw new ConflictException('Uploaded file type differs from the declared type');
    }

    const updated = await this.db.client.attachment.update({
      where: { id: attachment.id },
      data: { status: AttachmentStatus.UPLOADED, uploadedAt: new Date() },
    });
    return toResponse(updated);
  }

  async list(lotId: string): Promise<AttachmentResponse[]> {
    // Listar é só banco: sem bucket, a página do lote continua sem erro (upload e download dão 503).
    await this.assertLot(lotId);
    const attachments = await this.db.client.attachment.findMany({
      where: { lotId, status: AttachmentStatus.UPLOADED },
      orderBy: { createdAt: 'desc' },
    });
    return attachments.map(toResponse);
  }

  async download(lotId: string, id: string): Promise<DownloadUrlResponse> {
    this.storage.assertConfigured();
    const attachment = await this.find(lotId, id);
    if (attachment.status !== AttachmentStatus.UPLOADED) {
      throw new NotFoundException('Resource not found.');
    }
    return this.storage.createDownloadUrl(attachment.storageKey, attachment.fileName);
  }

  /** Lote de outra empresa não é encontrado (extensão de tenant) → 404. */
  private async assertLot(lotId: string): Promise<void> {
    await this.db.client.lot.findUniqueOrThrow({ where: { id: lotId }, select: { id: true } });
  }

  private find(lotId: string, id: string): Promise<Attachment> {
    return this.db.client.attachment.findFirstOrThrow({ where: { id, lotId } });
  }

  private requireUserId(): string {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new Error('Tenant context is missing the authenticated user');
    }
    return userId;
  }
}

/** Empresa e chave no bucket são detalhes internos: nunca saem na resposta. */
function toResponse(attachment: Attachment): AttachmentResponse {
  const { companyId: _companyId, storageKey: _storageKey, ...rest } = attachment;
  return rest;
}
