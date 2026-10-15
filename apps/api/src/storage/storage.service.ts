import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

export interface UploadPost {
  url: string;
  fields: Record<string, string>;
  expiresAt: Date;
}

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

export interface ObjectHead {
  sizeBytes: number;
  contentType: string | undefined;
}

interface StorageConfig {
  bucket: string;
  ttlSeconds: number;
  /** Fala com o S3 a partir da API (HEAD). */
  client: S3Client;
  /** Assina URLs entregues ao navegador (endpoint público, se diferente). */
  signer: S3Client;
}

/**
 * Acesso ao bucket privado de anexos (S3 na AWS, MinIO local). O navegador nunca recebe
 * credenciais: só URLs/formulários pré-assinados, de curta duração e restritos a uma chave.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storage: StorageConfig | undefined;

  constructor(config: ConfigService<Env, true>) {
    const bucket = config.get('S3_BUCKET', { infer: true });
    if (!bucket) {
      this.logger.warn('S3_BUCKET is not set: attachment endpoints will respond 503');
      return;
    }

    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const publicEndpoint = config.get('S3_PUBLIC_ENDPOINT', { infer: true });
    const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });

    const base: S3ClientConfig = {
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      // Sem checksums automáticos: o formulário/URL assinado não os envia (compatível com MinIO).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      // Na AWS, a role da Lambda fornece as credenciais (cadeia padrão do SDK).
      ...(accessKeyId && secretAccessKey && { credentials: { accessKeyId, secretAccessKey } }),
    };

    const client = new S3Client({ ...base, ...(endpoint && { endpoint }) });
    const signerEndpoint = publicEndpoint ?? endpoint;
    const signer =
      signerEndpoint === endpoint
        ? client
        : new S3Client({ ...base, ...(signerEndpoint && { endpoint: signerEndpoint }) });

    this.storage = {
      bucket,
      ttlSeconds: config.get('ATTACHMENT_URL_TTL_SECONDS', { infer: true }),
      client,
      signer,
    };
  }

  get isConfigured(): boolean {
    return this.storage !== undefined;
  }

  /** 503 quando o bucket não está configurado (a API continua subindo sem anexos). */
  assertConfigured(): void {
    this.require();
  }

  /**
   * Formulário de upload (POST pré-assinado). O próprio S3 recusa arquivo maior que `maxBytes`
   * ou com `Content-Type` diferente do declarado — o limite não depende do navegador.
   */
  async createUploadPost(key: string, contentType: string, maxBytes: number): Promise<UploadPost> {
    const { bucket, ttlSeconds, signer } = this.require();
    const { url, fields } = await createPresignedPost(signer, {
      Bucket: bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, maxBytes],
        ['eq', '$Content-Type', contentType],
      ],
      Fields: { 'Content-Type': contentType },
      Expires: ttlSeconds,
    });
    return { url, fields, expiresAt: expiresAt(ttlSeconds) };
  }

  /** Metadados do objeto, ou `undefined` se ele não existe. */
  async head(key: string): Promise<ObjectHead | undefined> {
    const { bucket, client } = this.require();
    try {
      const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { sizeBytes: out.ContentLength ?? 0, contentType: out.ContentType };
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
        return undefined;
      }
      throw error;
    }
  }

  /** Grava (ou sobrescreve) um objeto gerado pela própria API, ex.: o PDF da etiqueta. */
  async putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const { bucket, client } = this.require();
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /**
   * URL de download de curta duração. Por padrão força "baixar como" com o nome original;
   * `inline: true` deixa o navegador exibir o arquivo (ex.: PDF da etiqueta numa nova aba).
   */
  async createDownloadUrl(
    key: string,
    fileName: string,
    options: { inline?: boolean } = {},
  ): Promise<SignedUrl> {
    const { bucket, ttlSeconds, signer } = this.require();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: contentDisposition(
        fileName,
        options.inline ? 'inline' : 'attachment',
      ),
    });
    const url = await getSignedUrl(signer, command, { expiresIn: ttlSeconds });
    return { url, expiresAt: expiresAt(ttlSeconds) };
  }

  private require(): StorageConfig {
    if (!this.storage) {
      throw new ServiceUnavailableException('Storage not configured');
    }
    return this.storage;
  }
}

function expiresAt(ttlSeconds: number): Date {
  return new Date(Date.now() + ttlSeconds * 1000);
}

/** `attachment`/`inline` com nome ASCII de fallback + `filename*` (RFC 6266/5987) para acentos. */
export function contentDisposition(
  fileName: string,
  type: 'attachment' | 'inline' = 'attachment',
): string {
  const ascii = fileName
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/["\\]/g, '_')
    .trim();
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii || 'download'}"; filename*=UTF-8''${encoded}`;
}
